# VBT (Velocity-Based Training) IoT Barbell Tracker

**Timeline:** July 2026 – August 2026  
**Author:** Guilherme Camilo | [github.com/gcamilo1916-ship-it](https://github.com/gcamilo1916-ship-it) | [linkedin.com/in/guilherme-camilo](https://www.linkedin.com/in/guilherme-camilo)

## Summary
Portable, embedded IoT tracker engineered to measure barbell repetition velocity and estimate Rating of Perceived Exertion (RPE) during strength training. The system integrates a custom 3D-printed mechanical enclosure with an ESP32-C6 microcontroller and an MPU-6050 accelerometer/gyroscope, transmitting real-time kinematic data via Bluetooth Low Energy (WebBLE).

For detailed technicall information read through commited documents.

## Key Engineering Highlights
* **Hardware Integration:** Designed and wired a compact sensor node using a Seeed Studio XIAO ESP32-C6 and a GY-521 (MPU-6050) IMU communicating over a 400 kHz I2C bus, achieving a total hardware build cost under €15.
* **Firmware & Signal Processing:** Developed C++ firmware in PlatformIO to sample 6-axis inertial data at 100 Hz, filtering raw acceleration noise to compute mean concentric velocity with a <5% deviation across tested lifts.
* **Mechanical Enclosure Design:** Modeled and 3D-printed a snap-fit, impact-resistant housing in SolidWorks with a total mass of 40g, surviving heavy barbell drops and high-vibration training sessions without structural failure.
* **Project Execution:** Managed the end-to-end development lifecycle—from schematic layout to physical MVP testing—applying structured resource allocation and milestone tracking from the Santander Project Management certification.

## System Architecture & Hardware

| Component | Specification / Role | Interface / Parameter |
| :--- | :--- | :--- |
| **Microcontroller** | Seeed Studio XIAO ESP32-C6 | 3.3V Logic, BLE 5.0 |
| **Inertial Sensor** | MPU-6050 (GY-521 Breakout) | I2C (Address `0x68`) |
| **Communication** | I2C Protocol | SDA (Pin D4), SCL (Pin D5) |
| **Enclosure** | 3D-Printed Generative Design Custom Casing |

### I2C Wiring Schematic
![I2C Wiring Schematic](esquema_vbt.png)

## Mechanical Prototyping & MVP
* Used Fusion 360 to develop a Generative Design casing solution along with FEA studies to ensure optimal tensile strenght/mass ratio.
* Designed internal mounting bosses and tolerances in SolidWorks to prevent IMU board movement and eliminate false acceleration spikes during barbell impact.
* Iterated through 100's of physical enclosure prototypes to optimize magnetic barbell attachment and USB-C charging port accessibility.

<p align="center">
  <img src="mvp_foto_1.png" width="32%" alt="MVP View 1" />
  <img src="mvp_foto_2.png" width="32%" alt="MVP View 2" />
  <img src="mvp_foto_3.png" width="32%" alt="MVP View 3" />
</p>

## Firmware & Repository Structure
* `src/main.cpp`: Core C++ source code handling I2C initialization, MPU-6050 register configuration, velocity integration, and WebBLE broadcasting.
* `platformio.ini`: Build environment configuration, board definitions (`seeed_xiao_esp32c6`), and library dependencies.

## Project Management Documentation
Executed hardware procurement, CAD modeling, firmware debugging, and gym validation across a 6-week sprint schedule.
* [Santander Project Management Certificate](231_gcamilo1916@gmail.com.pdf)

| Component | Specification / Role | Interface / Parameter |
| :--- | :--- | :--- |
| **Microcontroller** | Seeed Studio XIAO ESP32-C6 | 3.3V Logic, BLE 5.0 |
| **Inertial Sensor** | MPU-6050 (GY-521 Breakout) | I2C (Address `0x68`) |
| **Communication** | I
