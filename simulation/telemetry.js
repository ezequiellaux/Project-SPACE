// ============================================================
// CANSAT 2022 – Sinergia Team – Panel de Telemetría
// ============================================================
// Panel lateral con datos de telemetría en tiempo real,
// mini-gráficos de altitud y velocidad.
// ============================================================

class TelemetryPanel {
    constructor() {
        // Historial para gráficos
        this.altitudeHistory = [];
        this.velocityHistory = [];
        this.maxHistoryPoints = 200;

        // Canvas para mini-gráficos
        this.altChart = document.getElementById('alt-chart');
        this.velChart = document.getElementById('vel-chart');
        this.altCtx = this.altChart ? this.altChart.getContext('2d') : null;
        this.velCtx = this.velChart ? this.velChart.getContext('2d') : null;

        this.lastUpdateTime = 0;
        this.updateInterval = 1 / 10; // 10 Hz telemetría (como XBee real)
    }

    update(physicsEngine, realTime) {
        // Throttle updates
        if (realTime - this.lastUpdateTime < this.updateInterval) return;
        this.lastUpdateTime = realTime;

        const s = physicsEngine.state;

        // ---- Valores principales ----
        this._setText('tel-altitude', Math.max(0, s.altitude).toFixed(1));
        this._setText('tel-velocity', Math.abs(s.velocity).toFixed(2));
        this._setText('tel-acceleration', s.acceleration.toFixed(2));
        this._setText('tel-temperature', s.temperature.toFixed(1));
        this._setText('tel-pressure', s.pressure.toFixed(1));
        this._setText('tel-gps-lat', s.gpsLat.toFixed(6));
        this._setText('tel-gps-lon', s.gpsLon.toFixed(6));
        this._setText('tel-heading', s.cameraHeading.toFixed(1));
        this._setText('tel-pitch', s.cameraPitch.toFixed(1));
        this._setText('tel-cable', s.cableDeployed.toFixed(2));
        this._setText('tel-mission-time', this._formatTime(s.missionTime));
        this._setText('tel-payload-alt', Math.max(0, s.payloadAltitude).toFixed(1));

        // ---- Fase de misión ----
        const phaseEl = document.getElementById('tel-phase');
        if (phaseEl) {
            phaseEl.textContent = this._phaseLabel(s.phase);
            phaseEl.className = 'phase-badge phase-' + s.phase.toLowerCase();
        }

        // ---- Datos de ingeniería ----
        this._setText('tel-drag-force', physicsEngine.getDragForce().toFixed(2));
        this._setText('tel-terminal-vel', physicsEngine.getTerminalVelocity().toFixed(2));
        this._setText('tel-air-density', physicsEngine.getAirDensity().toFixed(4));
        this._setText('tel-reynolds', physicsEngine.getReynoldsApprox().toFixed(0));

        // ---- Indicadores de estado ----
        this._setIndicator('ind-chute1', s.chute1Deployed);
        this._setIndicator('ind-chute2', s.chute2Deployed);
        this._setIndicator('ind-payload', s.payloadReleased);
        this._setIndicator('ind-cable', s.cableDeploying);

        // ---- Historial para gráficos ----
        if (s.phase !== MissionPhase.PREFLIGHT) {
            this.altitudeHistory.push(Math.max(0, s.altitude));
            this.velocityHistory.push(Math.abs(s.velocity));
            if (this.altitudeHistory.length > this.maxHistoryPoints) {
                this.altitudeHistory.shift();
                this.velocityHistory.shift();
            }
            this._drawChart(this.altCtx, this.altitudeHistory, '#44aaff', 800);
            this._drawChart(this.velCtx, this.velocityHistory, '#ff6644', 30);
        }

        // ---- Altímetro visual (barra) ----
        const altBar = document.getElementById('altimeter-fill');
        if (altBar) {
            const pct = Math.min(100, (Math.max(0, s.altitude) / ALTITUDE_APOGEE) * 100);
            altBar.style.height = pct + '%';
        }

        // ---- Brújula ----
        const compass = document.getElementById('compass-needle');
        if (compass) {
            compass.style.transform = `rotate(${s.cameraHeading}deg)`;
        }
    }

    reset() {
        this.altitudeHistory = [];
        this.velocityHistory = [];
        if (this.altCtx) this.altCtx.clearRect(0, 0, this.altChart.width, this.altChart.height);
        if (this.velCtx) this.velCtx.clearRect(0, 0, this.velChart.width, this.velChart.height);

        // Reset text fields
        const fields = ['tel-altitude', 'tel-velocity', 'tel-acceleration', 'tel-temperature',
            'tel-pressure', 'tel-gps-lat', 'tel-gps-lon', 'tel-heading', 'tel-pitch',
            'tel-cable', 'tel-mission-time', 'tel-payload-alt', 'tel-drag-force',
            'tel-terminal-vel', 'tel-air-density', 'tel-reynolds'];
        fields.forEach(id => this._setText(id, '—'));

        const phaseEl = document.getElementById('tel-phase');
        if (phaseEl) {
            phaseEl.textContent = 'PRE-VUELO';
            phaseEl.className = 'phase-badge phase-preflight';
        }

        ['ind-chute1', 'ind-chute2', 'ind-payload', 'ind-cable'].forEach(id =>
            this._setIndicator(id, false));

        const altBar = document.getElementById('altimeter-fill');
        if (altBar) altBar.style.height = '0%';
    }

    // ---- Helpers ----
    _setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    _setIndicator(id, active) {
        const el = document.getElementById(id);
        if (el) {
            el.classList.toggle('active', active);
        }
    }

    _formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 10);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
    }

    _phaseLabel(phase) {
        const labels = {
            PREFLIGHT: 'PRE-VUELO',
            LAUNCH: 'LANZAMIENTO',
            ASCENT: 'ASCENSO',
            APOGEE: 'APOGEO',
            DESCENT_1: 'DESCENSO 1 · 1er Paracaídas',
            DESCENT_2: 'DESCENSO 2 · 2do Paracaídas',
            PAYLOAD_RELEASE: 'LIBERACIÓN CARGA ÚTIL',
            FINAL_DESCENT: 'DESCENSO FINAL',
            LANDED: 'ATERRIZAJE ✓'
        };
        return labels[phase] || phase;
    }

    _drawChart(ctx, data, color, maxVal) {
        if (!ctx || data.length < 2) return;
        const w = ctx.canvas.width;
        const h = ctx.canvas.height;

        ctx.clearRect(0, 0, w, h);

        // Background grid
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i < 5; i++) {
            const y = (h / 5) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // Data line
        const gradient = ctx.createLinearGradient(0, 0, 0, h);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, 'transparent');

        // Fill
        ctx.fillStyle = gradient;
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.moveTo(0, h);
        data.forEach((val, i) => {
            const x = (i / (data.length - 1)) * w;
            const y = h - (val / maxVal) * h;
            ctx.lineTo(x, Math.max(0, Math.min(h, y)));
        });
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();

        // Line
        ctx.globalAlpha = 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        data.forEach((val, i) => {
            const x = (i / (data.length - 1)) * w;
            const y = h - (val / maxVal) * h;
            if (i === 0) ctx.moveTo(x, Math.max(0, Math.min(h, y)));
            else ctx.lineTo(x, Math.max(0, Math.min(h, y)));
        });
        ctx.stroke();
    }
}

window.TelemetryPanel = TelemetryPanel;
