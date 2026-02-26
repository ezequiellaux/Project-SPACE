// ============================================================
// CANSAT 2022 – Sinergia Team – Motor de Física e Ingeniería
// ============================================================
// Modelo atmosférico ISA, cálculos de drag, velocidad terminal,
// integración numérica semi-implícita de Euler.
// Basado en el PDR v3 del equipo Sinergia.
// ============================================================

// ---- Constantes Físicas ----
const GRAVITY = 9.80665;           // m/s² aceleración gravitatoria
const R_GAS = 8.31447;            // J/(mol·K) constante gases ideales
const M_AIR = 0.0289644;          // kg/mol masa molar aire
const LAPSE_RATE = 0.0065;        // K/m gradiente térmico troposfera
const T0_SEA = 288.15;            // K temperatura al nivel del mar
const P0_SEA = 101325;            // Pa presión al nivel del mar
const RHO0_SEA = 1.225;           // kg/m³ densidad aire al nivel del mar

// ---- Parámetros del CanSat (PDR) ----
const CANSAT_MASS = 0.600;        // kg masa total (RS1: 600g ± 10g)
const CONTAINER_MASS = 0.400;     // kg masa del contenedor (estimada)
const PAYLOAD_MASS = 0.200;       // kg masa de la carga útil (estimada)

// Paracaídas (PDR pág 13)
const CD_PARACHUTE = 1.5;         // Coeficiente de drag (hemisférico/cruciforme)
const AREA_CHUTE_1 = 0.08;        // m² área primer paracaídas (drogue)
const AREA_CHUTE_2 = 0.50;        // m² área segundo paracaídas (main)

// Contenedor cilíndrico (PDR pág 12)
const CONTAINER_DIAMETER = 0.1175; // m diámetro (117.5mm)
const CONTAINER_HEIGHT = 0.390;    // m altura (390mm)
const CONTAINER_CROSS_AREA = Math.PI * (CONTAINER_DIAMETER / 2) ** 2; // ~0.0108 m²
const CD_CYLINDER = 0.82;         // Coeficiente drag cilindro

// ---- Altitudes de transición (PDR ConOps) ----
const ALTITUDE_APOGEE = 725;      // m altitud de eyección
const ALTITUDE_CHUTE_2 = 400;     // m despliegue segundo paracaídas
const ALTITUDE_PAYLOAD_RELEASE = 300; // m liberación carga útil

// ---- Cable ----
const CABLE_LENGTH = 10;          // m longitud del cable (PDR)
const CABLE_DEPLOY_TIME = 20;     // s tiempo de despliegue (RS47: 20s)
const CABLE_DEPLOY_SPEED = CABLE_LENGTH / CABLE_DEPLOY_TIME; // 0.5 m/s

// ---- Cohete (estimaciones para fase de ascenso) ----
const ROCKET_MASS = 5.0;          // kg masa total cohete + cansat
const ROCKET_THRUST = 280;        // N empuje del motor
const ROCKET_BURN_TIME = 3.5;     // s tiempo de quemado
const ROCKET_CD = 0.3;            // Coeficiente drag cohete
const ROCKET_CROSS_AREA = Math.PI * (0.08) ** 2; // ~0.02 m²

// ---- Coordenadas GPS base (simuladas – zona de lanzamiento) ----
const GPS_BASE_LAT = -34.6037;    // Buenos Aires aprox
const GPS_BASE_LON = -58.3816;

// ============================================================
// Modelo Atmosférico ISA (International Standard Atmosphere)
// ============================================================
class AtmosphericModel {
    /**
     * Calcula temperatura a una altitud dada (troposfera < 11km)
     * T = T₀ - L·h
     */
    static temperature(altitude) {
        return T0_SEA - LAPSE_RATE * altitude;
    }

    /**
     * Calcula presión a una altitud dada
     * P = P₀ · (T/T₀)^(g·M / R·L)
     */
    static pressure(altitude) {
        const T = this.temperature(altitude);
        const exponent = (GRAVITY * M_AIR) / (R_GAS * LAPSE_RATE);
        return P0_SEA * Math.pow(T / T0_SEA, exponent);
    }

    /**
     * Calcula densidad del aire
     * ρ = P·M / (R·T)
     */
    static density(altitude) {
        const T = this.temperature(altitude);
        const P = this.pressure(altitude);
        return (P * M_AIR) / (R_GAS * T);
    }

    /**
     * Retorna temperatura en °C
     */
    static temperatureCelsius(altitude) {
        return this.temperature(altitude) - 273.15;
    }

    /**
     * Retorna presión en hPa (milibares)
     */
    static pressureHPa(altitude) {
        return this.pressure(altitude) / 100;
    }
}

// ============================================================
// Cálculos de Drag y Velocidad Terminal
// ============================================================
class DragCalculator {
    /**
     * Fuerza de arrastre: F_d = ½ · ρ · v² · Cd · A
     * @param {number} velocity - m/s
     * @param {number} altitude - m
     * @param {number} cd - coeficiente de drag
     * @param {number} area - m² área de referencia
     * @returns {number} fuerza de drag en N (misma dirección que v, opuesta)
     */
    static dragForce(velocity, altitude, cd, area) {
        const rho = AtmosphericModel.density(altitude);
        return 0.5 * rho * velocity * Math.abs(velocity) * cd * area;
    }

    /**
     * Velocidad terminal: v_t = √(2mg / ρ·Cd·A)
     * @param {number} mass - kg
     * @param {number} altitude - m
     * @param {number} cd - coeficiente de drag
     * @param {number} area - m² área de referencia
     * @returns {number} velocidad terminal en m/s
     */
    static terminalVelocity(mass, altitude, cd, area) {
        const rho = AtmosphericModel.density(altitude);
        return Math.sqrt((2 * mass * GRAVITY) / (rho * cd * area));
    }
}

// ============================================================
// Fases de la Misión
// ============================================================
const MissionPhase = {
    PREFLIGHT: 'PREFLIGHT',
    LAUNCH: 'LAUNCH',
    ASCENT: 'ASCENT',
    APOGEE: 'APOGEE',
    DESCENT_1: 'DESCENT_1',       // 1er paracaídas, v ≈ 15 m/s
    DESCENT_2: 'DESCENT_2',       // 2do paracaídas, v ≈ 5 m/s
    PAYLOAD_RELEASE: 'PAYLOAD_RELEASE',
    FINAL_DESCENT: 'FINAL_DESCENT',
    LANDED: 'LANDED'
};

// ============================================================
// Estado de la Simulación Física
// ============================================================
class PhysicsState {
    constructor() {
        this.reset();
    }

    reset() {
        // Posición y velocidad del contenedor
        this.altitude = 0;          // m
        this.velocity = 0;          // m/s (positivo = arriba)
        this.acceleration = 0;      // m/s²

        // Posición y velocidad de la carga útil
        this.payloadAltitude = 0;
        this.payloadVelocity = 0;

        // Cable
        this.cableDeployed = 0;     // m de cable desplegado
        this.cableDeploying = false;

        // Posición horizontal (para GPS simulado)
        this.horizontalX = 0;       // m drift por viento
        this.horizontalZ = 0;

        // Cohete
        this.rocketAltitude = 0;
        this.rocketVelocity = 0;
        this.rocketBurnTime = 0;
        this.rocketSeparated = false;

        // Fase
        this.phase = MissionPhase.PREFLIGHT;
        this.missionTime = 0;       // s tiempo desde lanzamiento
        this.phaseTime = 0;         // s tiempo en fase actual

        // Paracaídas
        this.chute1Deployed = false;
        this.chute2Deployed = false;

        // Carga útil
        this.payloadReleased = false;

        // Cámara orientación
        this.cameraHeading = 180;   // grados (180 = sur)
        this.cameraPitch = 45;      // grados inclinación

        // Viento (constante simple)
        this.windSpeedX = 1.5 + Math.random() * 2; // m/s viento lateral
        this.windSpeedZ = 0.5 + Math.random() * 1;

        // Telemetría
        this.temperature = AtmosphericModel.temperatureCelsius(0);
        this.pressure = AtmosphericModel.pressureHPa(0);
        this.gpsLat = GPS_BASE_LAT;
        this.gpsLon = GPS_BASE_LON;
    }
}

// ============================================================
// Motor de Física Principal
// ============================================================
class PhysicsEngine {
    constructor() {
        this.state = new PhysicsState();
        this.timeScale = 1;
    }

    reset() {
        this.state.reset();
    }

    /**
     * Actualiza la simulación un paso de tiempo
     * @param {number} dt - delta time en segundos (real)
     */
    update(dt) {
        const state = this.state;
        const simDt = dt * this.timeScale;

        if (state.phase === MissionPhase.PREFLIGHT || state.phase === MissionPhase.LANDED) {
            return;
        }

        state.missionTime += simDt;
        state.phaseTime += simDt;

        switch (state.phase) {
            case MissionPhase.LAUNCH:
                this._updateLaunch(simDt);
                break;
            case MissionPhase.ASCENT:
                this._updateAscent(simDt);
                break;
            case MissionPhase.APOGEE:
                this._updateApogee(simDt);
                break;
            case MissionPhase.DESCENT_1:
                this._updateDescent1(simDt);
                break;
            case MissionPhase.DESCENT_2:
                this._updateDescent2(simDt);
                break;
            case MissionPhase.PAYLOAD_RELEASE:
                this._updatePayloadRelease(simDt);
                break;
            case MissionPhase.FINAL_DESCENT:
                this._updateFinalDescent(simDt);
                break;
        }

        // Actualizar telemetría
        this._updateTelemetry();

        // Drift por viento
        this._updateWind(simDt);
    }

    // ---- LAUNCH: Motor del cohete encendido ----
    _updateLaunch(dt) {
        const s = this.state;
        s.rocketBurnTime += dt;

        // Empuje del motor
        const thrust = s.rocketBurnTime < ROCKET_BURN_TIME ? ROCKET_THRUST : 0;

        // Drag del cohete
        const drag = DragCalculator.dragForce(
            s.velocity, s.altitude, ROCKET_CD, ROCKET_CROSS_AREA
        );

        // Aceleración: a = (T - D)/m - g
        const totalMass = ROCKET_MASS + CANSAT_MASS;
        s.acceleration = (thrust - drag) / totalMass - GRAVITY;

        // Integración semi-implícita Euler
        s.velocity += s.acceleration * dt;
        s.altitude += s.velocity * dt;
        s.rocketAltitude = s.altitude;

        // Sin payload separado aún
        s.payloadAltitude = s.altitude;

        // Transición a ASCENT cuando se acaba el empuje
        if (s.rocketBurnTime >= ROCKET_BURN_TIME) {
            this._transitionTo(MissionPhase.ASCENT);
        }
    }

    // ---- ASCENT: Cohete sin empuje, sube por inercia ----
    _updateAscent(dt) {
        const s = this.state;

        const drag = DragCalculator.dragForce(
            s.velocity, s.altitude, ROCKET_CD, ROCKET_CROSS_AREA
        );
        const totalMass = ROCKET_MASS + CANSAT_MASS;
        s.acceleration = -drag / totalMass - GRAVITY;

        s.velocity += s.acceleration * dt;
        s.altitude += s.velocity * dt;
        s.rocketAltitude = s.altitude;
        s.payloadAltitude = s.altitude;

        // Apogeo cuando velocidad cruza 0 o alcanza 725m
        if (s.velocity <= 0 || s.altitude >= ALTITUDE_APOGEE) {
            s.altitude = Math.min(s.altitude, ALTITUDE_APOGEE);
            s.velocity = 0;
            this._transitionTo(MissionPhase.APOGEE);
        }
    }

    // ---- APOGEE: Eyección del CanSat ----
    _updateApogee(dt) {
        const s = this.state;

        // Separación instantánea (breve pausa de 0.5s)
        if (s.phaseTime >= 0.5) {
            s.rocketSeparated = true;
            s.chute1Deployed = true;
            s.velocity = -2; // velocidad inicial descendente
            this._transitionTo(MissionPhase.DESCENT_1);
        }

        // Cohete cae por separado
        s.rocketVelocity -= GRAVITY * dt;
        s.rocketAltitude += s.rocketVelocity * dt;
    }

    // ---- DESCENT_1: Descenso con 1er paracaídas (~15 m/s) ----
    _updateDescent1(dt) {
        const s = this.state;

        // Fuerza de drag del 1er paracaídas + cuerpo
        const dragChute = DragCalculator.dragForce(
            s.velocity, s.altitude, CD_PARACHUTE, AREA_CHUTE_1
        );
        const dragBody = DragCalculator.dragForce(
            s.velocity, s.altitude, CD_CYLINDER, CONTAINER_CROSS_AREA
        );

        // a = -g + F_drag/m (drag frena la caída)
        s.acceleration = -GRAVITY + (dragChute + dragBody) / CANSAT_MASS;
        s.velocity += s.acceleration * dt;

        // Limitar velocidad a terminal (evitar oscilaciones)
        const vTerm = DragCalculator.terminalVelocity(
            CANSAT_MASS, s.altitude, CD_PARACHUTE, AREA_CHUTE_1 + CONTAINER_CROSS_AREA
        );
        if (s.velocity < -vTerm) s.velocity = -vTerm;

        s.altitude += s.velocity * dt;
        s.payloadAltitude = s.altitude; // payload aún unido

        // Cohete cae libre
        this._updateRocketFreefall(dt);

        // Transición a 400m
        if (s.altitude <= ALTITUDE_CHUTE_2) {
            s.chute2Deployed = true;
            this._transitionTo(MissionPhase.DESCENT_2);
        }

        if (s.altitude <= 0) this._land();
    }

    // ---- DESCENT_2: 2do paracaídas desplegado (~5 m/s) ----
    _updateDescent2(dt) {
        const s = this.state;

        // Drag combinado de ambos paracaídas
        const totalArea = AREA_CHUTE_1 + AREA_CHUTE_2 + CONTAINER_CROSS_AREA;
        const dragTotal = DragCalculator.dragForce(
            s.velocity, s.altitude, CD_PARACHUTE, totalArea
        );

        s.acceleration = -GRAVITY + dragTotal / CANSAT_MASS;
        s.velocity += s.acceleration * dt;

        const vTerm = DragCalculator.terminalVelocity(
            CANSAT_MASS, s.altitude, CD_PARACHUTE, totalArea
        );
        if (s.velocity < -vTerm) s.velocity = -vTerm;

        s.altitude += s.velocity * dt;
        s.payloadAltitude = s.altitude;

        this._updateRocketFreefall(dt);

        // Transición a 300m
        if (s.altitude <= ALTITUDE_PAYLOAD_RELEASE) {
            s.payloadReleased = true;
            s.cableDeploying = true;
            s.payloadVelocity = s.velocity;
            this._transitionTo(MissionPhase.PAYLOAD_RELEASE);
        }

        if (s.altitude <= 0) this._land();
    }

    // ---- PAYLOAD_RELEASE: Cable desplegándose ----
    _updatePayloadRelease(dt) {
        const s = this.state;

        // Contenedor desciende con ambos paracaídas (masa reducida)
        const totalArea = AREA_CHUTE_1 + AREA_CHUTE_2 + CONTAINER_CROSS_AREA;
        const dragContainer = DragCalculator.dragForce(
            s.velocity, s.altitude, CD_PARACHUTE, totalArea
        );
        s.acceleration = -GRAVITY + dragContainer / CONTAINER_MASS;
        s.velocity += s.acceleration * dt;

        const vTermContainer = DragCalculator.terminalVelocity(
            CONTAINER_MASS, s.altitude, CD_PARACHUTE, totalArea
        );
        if (s.velocity < -vTermContainer) s.velocity = -vTermContainer;

        s.altitude += s.velocity * dt;

        // Cable se despliega a 0.5 m/s
        if (s.cableDeployed < CABLE_LENGTH) {
            s.cableDeployed += CABLE_DEPLOY_SPEED * dt;
            s.cableDeployed = Math.min(s.cableDeployed, CABLE_LENGTH);
        }

        // Payload cuelga del cable
        s.payloadAltitude = s.altitude - s.cableDeployed;
        s.payloadVelocity = s.velocity;

        this._updateRocketFreefall(dt);

        // Transición cuando cable está completamente desplegado
        if (s.cableDeployed >= CABLE_LENGTH) {
            s.cableDeploying = false;
            this._transitionTo(MissionPhase.FINAL_DESCENT);
        }

        if (s.altitude <= 0 || s.payloadAltitude <= 0) this._land();
    }

    // ---- FINAL_DESCENT: Descenso final con cable completo ----
    _updateFinalDescent(dt) {
        const s = this.state;

        // Sistema completo desciende junto
        const totalArea = AREA_CHUTE_1 + AREA_CHUTE_2 + CONTAINER_CROSS_AREA;
        const dragTotal = DragCalculator.dragForce(
            s.velocity, s.altitude, CD_PARACHUTE, totalArea
        );

        s.acceleration = -GRAVITY + dragTotal / CANSAT_MASS;
        s.velocity += s.acceleration * dt;

        const vTerm = DragCalculator.terminalVelocity(
            CANSAT_MASS, s.altitude, CD_PARACHUTE, totalArea
        );
        if (s.velocity < -vTerm) s.velocity = -vTerm;

        s.altitude += s.velocity * dt;
        s.payloadAltitude = s.altitude - CABLE_LENGTH;

        this._updateRocketFreefall(dt);

        if (s.payloadAltitude <= 0 || s.altitude <= 0) this._land();
    }

    // ---- Cohete en caída libre ----
    _updateRocketFreefall(dt) {
        const s = this.state;
        if (s.rocketAltitude > 0) {
            s.rocketVelocity -= GRAVITY * dt;
            const rocketDrag = DragCalculator.dragForce(
                s.rocketVelocity, s.rocketAltitude, ROCKET_CD, ROCKET_CROSS_AREA
            );
            s.rocketVelocity += (rocketDrag / ROCKET_MASS) * dt;
            s.rocketAltitude += s.rocketVelocity * dt;
            if (s.rocketAltitude < 0) s.rocketAltitude = 0;
        }
    }

    // ---- Drift por viento ----
    _updateWind(dt) {
        const s = this.state;
        if (s.phase !== MissionPhase.PREFLIGHT && s.phase !== MissionPhase.LANDED) {
            // Viento más fuerte a mayor altitud
            const windFactor = Math.min(s.altitude / 500, 1.5);
            s.horizontalX += s.windSpeedX * windFactor * dt;
            s.horizontalZ += s.windSpeedZ * windFactor * dt;
        }
    }

    // ---- Actualizar datos de telemetría ----
    _updateTelemetry() {
        const s = this.state;
        const alt = Math.max(0, s.altitude);

        // Sensor BMP280 con ruido
        s.temperature = AtmosphericModel.temperatureCelsius(alt) + (Math.random() - 0.5) * 0.3;
        s.pressure = AtmosphericModel.pressureHPa(alt) + (Math.random() - 0.5) * 0.2;

        // GPS simulado (drift basado en posición horizontal)
        const metersPerDegreeLat = 111320;
        const metersPerDegreeLon = 111320 * Math.cos(GPS_BASE_LAT * Math.PI / 180);
        s.gpsLat = GPS_BASE_LAT + s.horizontalZ / metersPerDegreeLat;
        s.gpsLon = GPS_BASE_LON + s.horizontalX / metersPerDegreeLon;

        // Orientación cámara (oscilación realista por viento)
        if (s.payloadReleased) {
            const oscillation = Math.sin(s.missionTime * 0.5) * 8;
            s.cameraHeading = 180 + oscillation; // 180° = sur, ±20° (RS45)
            s.cameraPitch = 45 + Math.sin(s.missionTime * 0.3) * 3;
        }
    }

    // ---- Transición de fase ----
    _transitionTo(newPhase) {
        this.state.phase = newPhase;
        this.state.phaseTime = 0;
    }

    // ---- Aterrizaje ----
    _land() {
        const s = this.state;
        s.altitude = Math.max(0, s.altitude);
        s.payloadAltitude = Math.max(0, s.payloadAltitude);
        s.velocity = 0;
        s.payloadVelocity = 0;
        s.acceleration = 0;
        this._transitionTo(MissionPhase.LANDED);
    }

    // ---- Iniciar misión ----
    startMission() {
        if (this.state.phase === MissionPhase.PREFLIGHT) {
            this._transitionTo(MissionPhase.LAUNCH);
        }
    }

    // ---- Getters de datos de ingeniería ----
    getDescentRate() {
        return Math.abs(this.state.velocity);
    }

    getDragForce() {
        const s = this.state;
        let cd, area;
        if (s.chute2Deployed) {
            cd = CD_PARACHUTE;
            area = AREA_CHUTE_1 + AREA_CHUTE_2 + CONTAINER_CROSS_AREA;
        } else if (s.chute1Deployed) {
            cd = CD_PARACHUTE;
            area = AREA_CHUTE_1 + CONTAINER_CROSS_AREA;
        } else {
            cd = ROCKET_CD;
            area = ROCKET_CROSS_AREA;
        }
        return Math.abs(DragCalculator.dragForce(s.velocity, s.altitude, cd, area));
    }

    getTerminalVelocity() {
        const s = this.state;
        let area = CONTAINER_CROSS_AREA;
        if (s.chute1Deployed) area += AREA_CHUTE_1;
        if (s.chute2Deployed) area += AREA_CHUTE_2;
        const mass = s.payloadReleased ? CONTAINER_MASS : CANSAT_MASS;
        return DragCalculator.terminalVelocity(mass, s.altitude, CD_PARACHUTE, area);
    }

    getAirDensity() {
        return AtmosphericModel.density(Math.max(0, this.state.altitude));
    }

    getReynoldsApprox() {
        // Número de Reynolds aproximado para el contenedor
        const rho = this.getAirDensity();
        const mu = 1.81e-5; // viscosidad dinámica aire ~18°C
        return (rho * Math.abs(this.state.velocity) * CONTAINER_DIAMETER) / mu;
    }
}

// Exportar para uso desde otros módulos
window.PhysicsEngine = PhysicsEngine;
window.PhysicsState = PhysicsState;
window.MissionPhase = MissionPhase;
window.AtmosphericModel = AtmosphericModel;
window.DragCalculator = DragCalculator;
window.ALTITUDE_APOGEE = ALTITUDE_APOGEE;
window.ALTITUDE_CHUTE_2 = ALTITUDE_CHUTE_2;
window.ALTITUDE_PAYLOAD_RELEASE = ALTITUDE_PAYLOAD_RELEASE;
window.CABLE_LENGTH = CABLE_LENGTH;
window.CANSAT_MASS = CANSAT_MASS;
window.CONTAINER_DIAMETER = CONTAINER_DIAMETER;
window.CONTAINER_HEIGHT = CONTAINER_HEIGHT;
