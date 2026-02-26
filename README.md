# 🚀 Simulación 3D – CanSat 2022 · Sinergia Team

Simulación interactiva de la misión CanSat con escena 3D (Three.js), motor de física real y telemetría en tiempo real.

## Cómo usarlo

1. **Abrir**: Abrí `index.html` en un navegador (Chrome/Firefox/Edge). Necesitás conexión a internet la primera vez para cargar Three.js desde CDN.

2. **Iniciar la misión**: Podés hacerlo de dos formas:
   - Hacé clic en **🚀 Iniciar Misión**
   - O usá el modo SIM: clic en **SIM ENABLE** → luego **SIM ACTIVATE**
   - O presioná la tecla **Espacio**

3. **Controles de cámara 3D** (mouse):
   - **Click izquierdo + arrastrar** → rotar la vista
   - **Scroll** → zoom in/out
   - **Click derecho + arrastrar** → paneo

4. **Controles de simulación**:
   | Acción | Botón | Tecla |
   |--------|-------|-------|
   | Iniciar / Pausar | ▶⏸ | `Espacio` |
   | Reset | 🔄 | `R` |
   | Velocidad 1× | 1× | `1` |
   | Velocidad 2× | 2× | `2` |
   | Velocidad 5× | 5× | `3` |
   | Velocidad 10× | 10× | `4` |

## Fases de la misión

| Fase | Altitud | Qué pasa |
|------|---------|----------|
| **Lanzamiento** | 0m → ~100m | Motor del cohete encendido |
| **Ascenso** | ~100m → 725m | Cohete sube por inercia |
| **Apogeo** | 725m | Eyección del CanSat, separación del cohete |
| **Descenso 1** | 725m → 400m | 1er paracaídas (cruciforme), ~15 m/s |
| **Descenso 2** | 400m → 300m | 2do paracaídas (cúpula), ~5 m/s |
| **Liberación carga útil** | 300m → ... | Cable de 10m se despliega en 20s |
| **Descenso final** | → 0m | Sistema completo desciende hasta aterrizaje |

## Panel de telemetría

El panel derecho muestra datos en tiempo real:

- **Altímetro** – Altitud del contenedor y carga útil + gráfico
- **Velocímetro** – Velocidad de descenso + aceleración + gráfico
- **Sensores BMP280** – Temperatura (°C) y presión (hPa) del modelo ISA
- **GPS** – Coordenadas simuladas con drift por viento
- **Brújula** – Orientación de la cámara (45° sur ± oscilación)
- **Ingeniería** – Fuerza de drag (N), velocidad terminal, densidad del aire (ρ), número de Reynolds

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `index.html` | Estructura HTML y carga de scripts |
| `index.css` | Estilos (tema oscuro, glassmorphism) |
| `physics.js` | Motor de física: modelo atmosférico ISA, drag, integración numérica |
| `scene.js` | Escena 3D: modelos, terreno, cielo, cámara, animaciones |
| `telemetry.js` | Panel de telemetría con gráficos en tiempo real |
| `main.js` | Orquestador: game loop, controles, máquina de estados |

## Modelo de física

- **Atmósfera ISA**: T = T₀ - L·h, P = P₀·(T/T₀)^(gM/RL)
- **Drag**: F_d = ½ · ρ · v² · Cd · A
- **Velocidad terminal**: v_t = √(2mg / ρCdA)
- **Integración**: Euler semi-implícito
- **Parámetros del PDR**: masa 600g, Cd=1.5, diámetro 117.5mm, altura 390mm
