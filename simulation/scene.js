// ============================================================
// CANSAT 2022 – Sinergia Team – Escena 3D (Three.js)
// ============================================================
// Modelos procedurales 3D: cohete, CanSat, paracaídas, cable,
// carga útil, terreno, cielo atmosférico.
// ============================================================

class CanSatScene {
    constructor(container) {
        this.container = container;
        this.clock = new THREE.Clock();

        // Scene
        this.scene = new THREE.Scene();

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        container.appendChild(this.renderer.domElement);

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            60, container.clientWidth / container.clientHeight, 0.1, 5000
        );
        this.camera.position.set(40, 30, 60);

        // Controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxDistance = 800;
        this.controls.minDistance = 5;

        // Scale: altitudes se comprimen para visualización
        // 725m * 0.2 = 145 unidades, cohete ~8.5 unidades = ~6% del rango
        this.VISUAL_SCALE = 0.2;
        // Cable: 10m real → 8 unidades visuales (exagerado para verse bien)
        this.CABLE_VISUAL_SCALE = 0.8;

        // Objects
        this.rocketGroup = null;
        this.cansatGroup = null;
        this.payloadGroup = null;
        this.chute1Mesh = null;
        this.chute2Mesh = null;
        this.cableLine = null;
        this.exhaustParticles = [];
        this.trailPoints = [];
        this.trailLine = null;

        // Init
        this._initLights();
        this._initSky();
        this._initTerrain();
        this._initAltitudeMarkers();
        this._initRocket();
        this._initCanSat();
        this._initPayload();
        this._initParachutes();
        this._initCable();
        this._initTrail();

        // Resize handler
        window.addEventListener('resize', () => this._onResize());
    }

    // ============ LIGHTING ============
    _initLights() {
        // Ambient
        const ambient = new THREE.AmbientLight(0x8899bb, 0.6);
        this.scene.add(ambient);

        // Directional (sun)
        const sun = new THREE.DirectionalLight(0xfff4e0, 1.2);
        sun.position.set(50, 80, 30);
        sun.castShadow = true;
        sun.shadow.camera.near = 0.1;
        sun.shadow.camera.far = 300;
        sun.shadow.camera.left = -100;
        sun.shadow.camera.right = 100;
        sun.shadow.camera.top = 100;
        sun.shadow.camera.bottom = -100;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        this.scene.add(sun);

        // Hemisphere (sky/ground)
        const hemi = new THREE.HemisphereLight(0x87CEEB, 0x3a5f0b, 0.4);
        this.scene.add(hemi);
    }

    // ============ SKY ============
    _initSky() {
        const skyGeo = new THREE.SphereGeometry(2000, 32, 32);
        const skyMat = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x0a1628) },
                bottomColor: { value: new THREE.Color(0x87CEEB) },
                offset: { value: 20 },
                exponent: { value: 0.4 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform float offset;
                uniform float exponent;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition + offset).y;
                    gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
                }
            `,
            side: THREE.BackSide
        });
        this.sky = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(this.sky);
    }

    // ============ TERRAIN ============
    _initTerrain() {
        // Ground plane
        const groundGeo = new THREE.PlaneGeometry(2000, 2000, 100, 100);
        const groundMat = new THREE.MeshLambertMaterial({
            color: 0x4a7c3f,
        });
        this.ground = new THREE.Mesh(groundGeo, groundMat);
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.position.y = -0.1;
        this.ground.receiveShadow = true;
        this.scene.add(this.ground);

        // Grid (larger to match new scale)
        const gridHelper = new THREE.GridHelper(1000, 100, 0x2d5a1e, 0x3d6a2e);
        gridHelper.position.y = 0;
        gridHelper.material.opacity = 0.3;
        gridHelper.material.transparent = true;
        this.scene.add(gridHelper);

        // Launch pad (circle)
        const padGeo = new THREE.CylinderGeometry(2, 2, 0.3, 32);
        const padMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
        const pad = new THREE.Mesh(padGeo, padMat);
        pad.position.y = 0.15;
        pad.castShadow = true;
        this.scene.add(pad);

        // Launch rail
        const railGeo = new THREE.CylinderGeometry(0.1, 0.1, 8, 8);
        const railMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
        const rail = new THREE.Mesh(railGeo, railMat);
        rail.position.y = 4;
        this.scene.add(rail);
    }

    // ============ ALTITUDE MARKERS ============
    _initAltitudeMarkers() {
        const altitudes = [
            { h: ALTITUDE_PAYLOAD_RELEASE, label: '300m - Payload Release', color: 0xff9900 },
            { h: ALTITUDE_CHUTE_2, label: '400m - 2nd Parachute', color: 0x00aaff },
            { h: ALTITUDE_APOGEE, label: '725m - Apogee', color: 0xff3333 },
        ];

        altitudes.forEach(({ h, label, color }) => {
            const y = h * this.VISUAL_SCALE;

            // Ring
            const ringGeo = new THREE.RingGeometry(15, 18, 64);
            const ringMat = new THREE.MeshBasicMaterial({
                color, side: THREE.DoubleSide, transparent: true, opacity: 0.15
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = y;
            this.scene.add(ring);

            // Dashed line
            const dashGeo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(-18, y, 0),
                new THREE.Vector3(18, y, 0)
            ]);
            const dashMat = new THREE.LineDashedMaterial({
                color, dashSize: 0.5, gapSize: 0.3, transparent: true, opacity: 0.4
            });
            const dashLine = new THREE.Line(dashGeo, dashMat);
            dashLine.computeLineDistances();
            this.scene.add(dashLine);
        });
    }

    // ============ ROCKET ============
    _initRocket() {
        this.rocketGroup = new THREE.Group();

        // Body
        const bodyGeo = new THREE.CylinderGeometry(0.8, 0.8, 6, 16);
        const bodyMat = new THREE.MeshPhongMaterial({ color: 0xdd3333, shininess: 80 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 3;
        body.castShadow = true;
        this.rocketGroup.add(body);

        // Nose cone
        const noseGeo = new THREE.ConeGeometry(0.8, 2.5, 16);
        const noseMat = new THREE.MeshPhongMaterial({ color: 0xeeeeee, shininess: 100 });
        const nose = new THREE.Mesh(noseGeo, noseMat);
        nose.position.y = 7.25;
        this.rocketGroup.add(nose);

        // Fins (4x)
        for (let i = 0; i < 4; i++) {
            const finShape = new THREE.Shape();
            finShape.moveTo(0, 0);
            finShape.lineTo(1.5, 0);
            finShape.lineTo(0.3, 2);
            finShape.lineTo(0, 2);
            const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.08, bevelEnabled: false });
            const finMat = new THREE.MeshPhongMaterial({ color: 0xbb2222 });
            const fin = new THREE.Mesh(finGeo, finMat);
            fin.rotation.y = (Math.PI / 2) * i;
            fin.position.y = 0;
            fin.position.x = Math.cos((Math.PI / 2) * i) * 0.8;
            fin.position.z = Math.sin((Math.PI / 2) * i) * 0.8;
            this.rocketGroup.add(fin);
        }

        this.rocketGroup.position.y = 0.5;
        this.scene.add(this.rocketGroup);
    }

    // ============ CANSAT CONTAINER ============
    _initCanSat() {
        this.cansatGroup = new THREE.Group();

        // Escala consistente con el cohete:
        // Cohete: radio 0.8 unidades = 62.5mm real → factor = 0.8/0.0625 = 12.8 /m
        // CanSat: diámetro 117.5mm → radio = 58.75mm → 0.05875 * 12.8 = 0.752
        // CanSat: altura 390mm → 0.390 * 12.8 = 4.99
        const cansatRadius = 0.75;  // ligeramente menor que cohete (0.8)
        const cansatHeight = 5.0;   // cabe dentro del cohete body (6)

        // Cilindro exterior (azul con perforaciones simuladas)
        const shellGeo = new THREE.CylinderGeometry(cansatRadius, cansatRadius, cansatHeight, 24);
        const shellMat = new THREE.MeshPhongMaterial({
            color: 0x2255cc,
            shininess: 90,
            transparent: true,
            opacity: 0.85
        });
        const shell = new THREE.Mesh(shellGeo, shellMat);
        shell.castShadow = true;
        this.cansatGroup.add(shell);

        // Tapa superior
        const topCapGeo = new THREE.CylinderGeometry(cansatRadius + 0.03, cansatRadius + 0.03, 0.15, 24);
        const topCapMat = new THREE.MeshPhongMaterial({ color: 0x3366dd, shininess: 100 });
        this.topCap = new THREE.Mesh(topCapGeo, topCapMat);
        this.topCap.position.y = cansatHeight / 2 + 0.08;
        this.cansatGroup.add(this.topCap);

        // Tapa inferior
        const botCapGeo = new THREE.CylinderGeometry(cansatRadius + 0.03, cansatRadius + 0.03, 0.15, 24);
        const botCapMat = new THREE.MeshPhongMaterial({ color: 0x3366dd, shininess: 100 });
        const botCap = new THREE.Mesh(botCapGeo, botCapMat);
        botCap.position.y = -(cansatHeight / 2 + 0.08);
        this.cansatGroup.add(botCap);

        // Antena (varilla superior)
        const antennaGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8);
        const antennaMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
        const antenna = new THREE.Mesh(antennaGeo, antennaMat);
        antenna.position.y = cansatHeight / 2 + 0.7;
        this.cansatGroup.add(antenna);

        // LED indicador
        const ledGeo = new THREE.SphereGeometry(0.08, 8, 8);
        const ledMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        this.ledMesh = new THREE.Mesh(ledGeo, ledMat);
        this.ledMesh.position.set(cansatRadius + 0.05, 0, 0);
        this.cansatGroup.add(this.ledMesh);

        this.cansatGroup.visible = false;
        this.scene.add(this.cansatGroup);
    }

    // ============ PAYLOAD ============
    _initPayload() {
        this.payloadGroup = new THREE.Group();

        // Carga útil: más pequeña que el contenedor
        // Proporcionalmente ~60% del radio del CanSat
        const payloadRadius = 0.45;
        const payloadHeight = 1.8;

        // Cuerpo pequeño cilíndrico
        const bodyGeo = new THREE.CylinderGeometry(payloadRadius, payloadRadius, payloadHeight, 16);
        const bodyMat = new THREE.MeshPhongMaterial({ color: 0x229944, shininess: 80 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.castShadow = true;
        this.payloadGroup.add(body);

        // Cámara (cubo)
        const camGeo = new THREE.BoxGeometry(0.3, 0.3, 0.4);
        const camMat = new THREE.MeshPhongMaterial({ color: 0x111111 });
        const cam = new THREE.Mesh(camGeo, camMat);
        cam.position.set(payloadRadius + 0.1, -payloadHeight / 2 + 0.15, 0);
        cam.rotation.z = -Math.PI / 4; // 45° para apuntar al sur
        this.payloadGroup.add(cam);

        // Lente de la cámara
        const lensGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.15, 12);
        const lensMat = new THREE.MeshPhongMaterial({ color: 0x333366 });
        const lens = new THREE.Mesh(lensGeo, lensMat);
        lens.position.set(payloadRadius + 0.3, -payloadHeight / 2 + 0.3, 0);
        lens.rotation.z = -Math.PI / 4;
        this.payloadGroup.add(lens);

        this.payloadGroup.visible = false;
        this.scene.add(this.payloadGroup);
    }

    // ============ PARACHUTES ============
    _initParachutes() {
        // ---- 1er paracaídas: CRUCIFORME 3D (caja con paneles curvos cóncavos) ----
        // Como se ve en el PDR: forma de cubo/caja con 4 caras curvadas hacia adentro.
        // Visto desde arriba tiene la forma de una cruz (+).
        this.chute1Mesh = new THREE.Group();
        const boxSize = 1.8;
        const boxHeight = 1.5;
        const chute1Mat = new THREE.MeshPhongMaterial({
            color: 0xff6600,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.88
        });
        const chute1MatDark = new THREE.MeshPhongMaterial({
            color: 0xcc5500,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.88
        });

        // 4 paneles curvos cóncavos (caras del cubo)
        for (let i = 0; i < 4; i++) {
            const panelGeo = new THREE.PlaneGeometry(boxSize, boxHeight, 10, 8);
            const posAttr = panelGeo.attributes.position;
            for (let v = 0; v < posAttr.count; v++) {
                const x = posAttr.getX(v);
                const y = posAttr.getY(v);
                // Curvar hacia afuera (convexo/inflado)
                const curveFactor = (1 - Math.pow(2 * x / boxSize, 2)) *
                    (1 - Math.pow(2 * y / boxHeight, 4));
                posAttr.setZ(v, curveFactor * 0.6);
            }
            panelGeo.computeVertexNormals();
            const panel = new THREE.Mesh(panelGeo, i % 2 === 0 ? chute1Mat : chute1MatDark);
            const angle = (Math.PI / 2) * i;
            panel.position.set(
                Math.sin(angle) * boxSize / 2,
                0,
                Math.cos(angle) * boxSize / 2
            );
            panel.rotation.y = angle;
            this.chute1Mesh.add(panel);
        }

        // Base inferior del cubo (ligeramente curvada)
        const bottomGeo = new THREE.PlaneGeometry(boxSize, boxSize, 8, 8);
        const bPosAttr = bottomGeo.attributes.position;
        for (let v = 0; v < bPosAttr.count; v++) {
            const x = bPosAttr.getX(v);
            const y = bPosAttr.getY(v);
            const dist = Math.sqrt(x * x + y * y) / (boxSize * 0.7);
            bPosAttr.setZ(v, dist * dist * 0.15);
        }
        bottomGeo.computeVertexNormals();
        const bottom = new THREE.Mesh(bottomGeo, chute1Mat);
        bottom.rotation.x = Math.PI / 2;
        bottom.position.y = -boxHeight / 2;
        this.chute1Mesh.add(bottom);

        // Tapa superior del cubo (ligeramente curvada hacia arriba)
        const topGeo = new THREE.PlaneGeometry(boxSize, boxSize, 8, 8);
        const tPosAttr = topGeo.attributes.position;
        for (let v = 0; v < tPosAttr.count; v++) {
            const x = tPosAttr.getX(v);
            const y = tPosAttr.getY(v);
            const dist = Math.sqrt(x * x + y * y) / (boxSize * 0.7);
            tPosAttr.setZ(v, -dist * dist * 0.15);
        }
        topGeo.computeVertexNormals();
        const top = new THREE.Mesh(topGeo, chute1Mat);
        top.rotation.x = Math.PI / 2;
        top.position.y = boxHeight / 2;
        this.chute1Mesh.add(top);

        this.chute1Mesh.visible = false;
        this.scene.add(this.chute1Mesh);

        // Cuerdas del 1er paracaídas
        this.chute1Lines = this._createChuteLines(boxSize * 0.7, 0xff6600);

        // ---- 2do paracaídas: CÚPULA FESTONEADA (tipo concha/abanico) ----
        // Cúpula baja con gajos que se abomban y bordes ondulados/pétalos.
        this.chute2Mesh = new THREE.Group();
        const domeRadius = 4.5;
        const domeHeight = 3.5;
        const numGores = 10;
        const chute2Mat = new THREE.MeshPhongMaterial({
            color: 0xff3399,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.82
        });
        const chute2MatAlt = new THREE.MeshPhongMaterial({
            color: 0xee2288,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.82
        });

        const goreAngle = (Math.PI * 2) / numGores;
        for (let i = 0; i < numGores; i++) {
            const a1 = goreAngle * i;
            const a2 = goreAngle * (i + 1);
            const aMid = (a1 + a2) / 2;
            const uSegs = 6;
            const vSegs = 8;
            const vertices = [];
            const indices = [];

            for (let vi = 0; vi <= vSegs; vi++) {
                const t = vi / vSegs; // 0=center, 1=edge
                const r = domeRadius * t;
                for (let ui = 0; ui <= uSegs; ui++) {
                    const s = ui / uSegs;
                    const angle = a1 + (a2 - a1) * s;
                    const x = Math.cos(angle) * r;
                    const z = Math.sin(angle) * r;

                    // Perfil de cúpula achatada
                    const baseY = domeHeight * (1 - t * t);
                    // Festoneado: borde sube en el centro del gajo, baja entre gajos
                    const edgeDist = Math.abs(s - 0.5) * 2;
                    const scallop = t * t * (1 - edgeDist * edgeDist) * 0.8;
                    // Abombado radial de cada gajo
                    const bulge = Math.sin(s * Math.PI) * t * 0.4;
                    const bx = x + Math.cos(aMid) * bulge;
                    const bz = z + Math.sin(aMid) * bulge;

                    vertices.push(bx, baseY + scallop, bz);
                }
            }

            for (let vi = 0; vi < vSegs; vi++) {
                for (let ui = 0; ui < uSegs; ui++) {
                    const a = vi * (uSegs + 1) + ui;
                    const b = a + 1;
                    const c = a + (uSegs + 1);
                    const d = c + 1;
                    indices.push(a, c, b);
                    indices.push(b, c, d);
                }
            }

            const goreGeo = new THREE.BufferGeometry();
            goreGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            goreGeo.setIndex(indices);
            goreGeo.computeVertexNormals();

            const mat = i % 2 === 0 ? chute2Mat : chute2MatAlt;
            const gore = new THREE.Mesh(goreGeo, mat);
            this.chute2Mesh.add(gore);
        }

        this.chute2Mesh.visible = false;
        this.scene.add(this.chute2Mesh);

        // Cuerdas del 2do paracaídas
        this.chute2Lines = this._createChuteLines(domeRadius * 0.9, 0xff3399);
    }

    _createChuteLines(radius, color) {
        const lines = [];
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI * 2 * i) / 6;
            const geo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(
                    Math.cos(angle) * radius * 0.8,
                    -3,
                    Math.sin(angle) * radius * 0.8
                )
            ]);
            const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 });
            const line = new THREE.Line(geo, mat);
            line.frustumCulled = false; // posiciones se actualizan dinámicamente
            line.visible = false;
            this.scene.add(line);
            lines.push(line);
        }
        return lines;
    }

    // ============ CABLE ============
    _initCable() {
        const cableGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, -1, 0)
        ]);
        const cableMat = new THREE.LineBasicMaterial({
            color: 0xcccccc,
            linewidth: 2
        });
        this.cableLine = new THREE.Line(cableGeo, cableMat);
        this.cableLine.visible = false;
        this.scene.add(this.cableLine);
    }

    // ============ TRAIL ============
    _initTrail() {
        const maxPoints = 2000;
        this.trailPositions = new Float32Array(maxPoints * 3);
        this.trailIndex = 0;
        const trailGeo = new THREE.BufferGeometry();
        trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
        trailGeo.setDrawRange(0, 0);
        const trailMat = new THREE.LineBasicMaterial({
            color: 0x44aaff,
            transparent: true,
            opacity: 0.4
        });
        this.trailLine = new THREE.Line(trailGeo, trailMat);
        this.scene.add(this.trailLine);
    }

    // ============ UPDATE FROM PHYSICS ============
    update(physicsState) {
        const s = physicsState;
        const vs = this.VISUAL_SCALE;
        const os = this.OBJECT_SCALE;

        // Posiciones con clamp al suelo (objetos no atraviesan el piso)
        // Sumamos la mitad de la altura de cada objeto para que apoyen sobre el suelo
        const cansatY = Math.max(2.5, s.altitude * vs);     // cansat height ~5, center at 2.5
        const payloadY = Math.max(1.0, s.payloadAltitude * vs); // payload height ~1.8, center at ~1
        const rocketY = Math.max(0, s.rocketAltitude * vs);
        const hx = s.horizontalX * vs;
        const hz = s.horizontalZ * vs;

        // ---- Phase-based visibility ----
        const isFlying = s.phase !== MissionPhase.PREFLIGHT && s.phase !== MissionPhase.LANDED;
        const isPreOrLaunch = s.phase === MissionPhase.PREFLIGHT ||
            s.phase === MissionPhase.LAUNCH || s.phase === MissionPhase.ASCENT;

        // ---- Rocket ----
        if (isPreOrLaunch) {
            this.rocketGroup.visible = true;
            this.rocketGroup.position.set(0, rocketY + 0.5, 0);
            this.cansatGroup.visible = false;
        } else {
            // Rocket separated - falls
            this.rocketGroup.visible = s.rocketAltitude > 0;
            this.rocketGroup.position.y = rocketY + 0.5;
            this.rocketGroup.position.x = -hx * 0.3; // rocket drifts differently
        }

        // ---- CanSat ----
        if (s.phase === MissionPhase.APOGEE || (!isPreOrLaunch && s.phase !== MissionPhase.PREFLIGHT)) {
            this.cansatGroup.visible = true;
            this.cansatGroup.position.set(hx, cansatY, hz);

            // Slight wobble
            this.cansatGroup.rotation.x = Math.sin(s.missionTime * 2) * 0.05;
            this.cansatGroup.rotation.z = Math.cos(s.missionTime * 1.5) * 0.05;
        }

        // ---- LED blink ----
        if (this.ledMesh && isFlying) {
            this.ledMesh.material.color.setHex(
                Math.sin(s.missionTime * 5) > 0 ? 0x00ff00 : 0x003300
            );
        }

        // ---- Parachute 1 ----
        if (s.chute1Deployed) {
            this.chute1Mesh.visible = true;
            // Chute1 siempre a la misma altura (arriba de todo)
            const c1y = cansatY + 20;
            this.chute1Mesh.position.set(hx, c1y, hz);
            // Breathing animation
            const breathe = 1 + Math.sin(s.missionTime * 3) * 0.05;
            this.chute1Mesh.scale.set(breathe, breathe * 0.8, breathe);

            // Lines: si hay chute2, las cuerdas del chute1 van al tope del chute2
            const c1LineBottomY = s.chute2Deployed ? cansatY + 14 : cansatY + 3;
            this.chute1Lines.forEach((line, i) => {
                line.visible = true;
                const angle = (Math.PI * 2 * i) / 6;
                const positions = line.geometry.attributes.position.array;
                positions[0] = hx; positions[1] = c1LineBottomY; positions[2] = hz;
                positions[3] = hx + Math.cos(angle) * 1.5;
                positions[4] = c1y;
                positions[5] = hz + Math.sin(angle) * 1.5;
                line.geometry.attributes.position.needsUpdate = true;
            });
        } else {
            this.chute1Mesh.visible = false;
            this.chute1Lines.forEach(l => l.visible = false);
        }

        // ---- Parachute 2 ----
        if (s.chute2Deployed) {
            this.chute2Mesh.visible = true;
            const c2y = cansatY + 10;
            this.chute2Mesh.position.set(hx, c2y, hz);
            const breathe2 = 1 + Math.sin(s.missionTime * 2.5 + 1) * 0.04;
            this.chute2Mesh.scale.set(breathe2, breathe2 * 0.7, breathe2);

            this.chute2Lines.forEach((line, i) => {
                line.visible = true;
                const angle = (Math.PI * 2 * i) / 6;
                const positions = line.geometry.attributes.position.array;
                positions[0] = hx; positions[1] = cansatY + 3; positions[2] = hz;
                positions[3] = hx + Math.cos(angle) * 3;
                positions[4] = c2y;
                positions[5] = hz + Math.sin(angle) * 3;
                line.geometry.attributes.position.needsUpdate = true;
            });
        } else {
            this.chute2Mesh.visible = false;
            this.chute2Lines.forEach(l => l.visible = false);
        }

        // ---- Payload & Cable (con escala exagerada para visibilidad) ----
        const cableVisualLen = s.cableDeployed * this.CABLE_VISUAL_SCALE;
        const visualPayloadY = Math.max(1.0, cansatY - 3 - cableVisualLen);

        if (s.payloadReleased) {
            this.payloadGroup.visible = true;
            this.payloadGroup.position.set(hx, visualPayloadY, hz);
            // Camera points south
            this.payloadGroup.rotation.y = (s.cameraHeading * Math.PI) / 180;
        } else {
            this.payloadGroup.visible = false;
        }

        // ---- Cable ----
        if (s.payloadReleased && s.cableDeployed > 0) {
            this.cableLine.visible = true;
            const positions = this.cableLine.geometry.attributes.position.array;
            positions[0] = hx; positions[1] = cansatY - 3; positions[2] = hz;
            positions[3] = hx; positions[4] = visualPayloadY + 1; positions[5] = hz;
            this.cableLine.geometry.attributes.position.needsUpdate = true;
        } else {
            this.cableLine.visible = false;
        }

        // ---- Trail ----
        if (isFlying && this.trailIndex < this.trailPositions.length / 3 - 1) {
            const idx = this.trailIndex * 3;
            this.trailPositions[idx] = hx;
            this.trailPositions[idx + 1] = cansatY;
            this.trailPositions[idx + 2] = hz;
            this.trailIndex++;
            this.trailLine.geometry.setDrawRange(0, this.trailIndex);
            this.trailLine.geometry.attributes.position.needsUpdate = true;
        }

        // ---- Top cap animation (opens at DESCENT_2) ----
        if (s.chute2Deployed && this.topCap) {
            this.topCap.rotation.x = Math.min(this.topCap.rotation.x + 0.02, Math.PI / 3);
            this.topCap.position.z = Math.sin(this.topCap.rotation.x) * 1;
        }

        // ---- Camera follow ----
        if (isFlying) {
            const targetY = cansatY + 3;
            this.controls.target.lerp(
                new THREE.Vector3(hx, targetY, hz), 0.02
            );
        }

        // Update controls
        this.controls.update();
    }

    // ============ RENDER ============
    render() {
        this.renderer.render(this.scene, this.camera);
    }

    // ============ RESET ============
    resetScene() {
        this.rocketGroup.position.set(0, 0.5, 0);
        this.rocketGroup.visible = true;
        this.cansatGroup.visible = false;
        this.cansatGroup.position.set(0, 0, 0);
        this.payloadGroup.visible = false;
        this.chute1Mesh.visible = false;
        this.chute2Mesh.visible = false;
        this.cableLine.visible = false;
        this.chute1Lines.forEach(l => l.visible = false);
        this.chute2Lines.forEach(l => l.visible = false);

        if (this.topCap) {
            this.topCap.rotation.x = 0;
            this.topCap.position.z = 0;
        }

        // Reset trail
        this.trailIndex = 0;
        this.trailPositions.fill(0);
        this.trailLine.geometry.setDrawRange(0, 0);
        this.trailLine.geometry.attributes.position.needsUpdate = true;

        // Reset camera
        this.camera.position.set(40, 30, 60);
        this.controls.target.set(0, 5, 0);
        this.controls.update();
    }

    _onResize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }
}

window.CanSatScene = CanSatScene;
