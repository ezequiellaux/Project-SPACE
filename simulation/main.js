// ============================================================
// CANSAT 2022 – Sinergia Team – Main Orchestrator
// ============================================================
// Game loop, controles de UI, coordinación Physics ↔ Scene ↔ Telemetry
// ============================================================

class CanSatSimulation {
    constructor() {
        this.physics = new PhysicsEngine();
        this.scene = new CanSatScene(document.getElementById('viewport'));
        this.telemetry = new TelemetryPanel();

        this.running = false;
        this.lastFrameTime = 0;

        this._initControls();
        this._initKeyboard();
        this.telemetry.reset();

        // Start render loop
        this._animate = this._animate.bind(this);
        requestAnimationFrame(this._animate);
    }

    // ============ GAME LOOP ============
    _animate(timestamp) {
        requestAnimationFrame(this._animate);

        const dt = Math.min((timestamp - this.lastFrameTime) / 1000, 0.05); // cap at 50ms
        this.lastFrameTime = timestamp;

        if (this.running) {
            this.physics.update(dt);
            this.scene.update(this.physics.state);
            this.telemetry.update(this.physics, timestamp / 1000);

            // Auto-stop on landing
            if (this.physics.state.phase === MissionPhase.LANDED) {
                this.running = false;
                this._updateButtonStates();
            }
        }

        this.scene.render();
    }

    // ============ CONTROLS ============
    _initControls() {
        // Launch button
        const btnLaunch = document.getElementById('btn-launch');
        if (btnLaunch) {
            btnLaunch.addEventListener('click', () => this._startMission());
        }

        // Pause button
        const btnPause = document.getElementById('btn-pause');
        if (btnPause) {
            btnPause.addEventListener('click', () => this._togglePause());
        }

        // Reset button
        const btnReset = document.getElementById('btn-reset');
        if (btnReset) {
            btnReset.addEventListener('click', () => this._reset());
        }

        // Speed buttons
        document.querySelectorAll('.speed-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const speed = parseFloat(e.target.dataset.speed);
                this.physics.timeScale = speed;
                document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
            });
        });

        // SIM mode buttons
        const btnSimEnable = document.getElementById('btn-sim-enable');
        const btnSimActivate = document.getElementById('btn-sim-activate');
        if (btnSimEnable) {
            btnSimEnable.addEventListener('click', () => {
                btnSimEnable.classList.add('active');
                const simStatus = document.getElementById('sim-status');
                if (simStatus) simStatus.textContent = 'SIM ENABLED';
            });
        }
        if (btnSimActivate) {
            btnSimActivate.addEventListener('click', () => {
                const simStatus = document.getElementById('sim-status');
                if (btnSimEnable && btnSimEnable.classList.contains('active')) {
                    btnSimActivate.classList.add('active');
                    if (simStatus) simStatus.textContent = 'SIM ACTIVE';
                    this._startMission();
                } else {
                    if (simStatus) simStatus.textContent = 'ERROR: Enable SIM first';
                }
            });
        }
    }

    _initKeyboard() {
        document.addEventListener('keydown', (e) => {
            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    if (this.physics.state.phase === MissionPhase.PREFLIGHT) {
                        this._startMission();
                    } else {
                        this._togglePause();
                    }
                    break;
                case 'r':
                case 'R':
                    this._reset();
                    break;
                case '1': this.physics.timeScale = 1; this._updateSpeedButtons(1); break;
                case '2': this.physics.timeScale = 2; this._updateSpeedButtons(2); break;
                case '3': this.physics.timeScale = 5; this._updateSpeedButtons(5); break;
                case '4': this.physics.timeScale = 10; this._updateSpeedButtons(10); break;
            }
        });
    }

    _startMission() {
        this.physics.startMission();
        this.running = true;
        this._updateButtonStates();
    }

    _togglePause() {
        this.running = !this.running;
        this._updateButtonStates();
    }

    _reset() {
        this.running = false;
        this.physics.reset();
        this.scene.resetScene();
        this.telemetry.reset();
        this._updateButtonStates();

        // Reset SIM buttons
        document.querySelectorAll('.sim-btn').forEach(b => b.classList.remove('active'));
        const simStatus = document.getElementById('sim-status');
        if (simStatus) simStatus.textContent = 'STANDBY';
    }

    _updateButtonStates() {
        const btnLaunch = document.getElementById('btn-launch');
        const btnPause = document.getElementById('btn-pause');
        const phase = this.physics.state.phase;

        if (btnLaunch) {
            btnLaunch.disabled = phase !== MissionPhase.PREFLIGHT;
        }
        if (btnPause) {
            btnPause.textContent = this.running ? '⏸ Pausa' : '▶ Continuar';
            btnPause.disabled = phase === MissionPhase.PREFLIGHT || phase === MissionPhase.LANDED;
        }
    }

    _updateSpeedButtons(speed) {
        document.querySelectorAll('.speed-btn').forEach(btn => {
            btn.classList.toggle('active', parseFloat(btn.dataset.speed) === speed);
        });
    }
}

// ============ INIT ============
window.addEventListener('DOMContentLoaded', () => {
    window.sim = new CanSatSimulation();
});
