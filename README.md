# VBT (Velocity-Based Training) IoT Barbell Tracker

**Timeline:** July 2026 – August 2026  
**Author:** Guilherme Camilo | [github.com/gcamilo1916-ship-it](https://github.com/gcamilo1916-ship-it) | [linkedin.com/in/guilherme-camilo](https://www.linkedin.com/in/guilherme-camilo)

## Summary
Portable, embedded IoT tracker engineered to measure barbell repetition velocity and estimate Rating of Perceived Exertion (RPE) during strength training. The system integrates a custom 3D-printed mechanical enclosure with an ESP32-C6 microcontroller and an MPU-6050 accelerometer/gyroscope, transmitting real-time kinematic data via Bluetooth Low Energy (WebBLE).

## Key Engineering Highlights
* **Hardware Integration:** Designed and wired a compact sensor node using a Seeed Studio XIAO ESP32-C6 and a GY-521 (MPU-6050) IMU communicating over a 400 kHz I2C bus, achieving a total hardware build cost under [e.g., €15].
* **Firmware & Signal Processing:** Developed C++ firmware in PlatformIO to sample 6-axis inertial data at [e.g., 100 Hz], filtering raw acceleration noise to compute mean concentric velocity with a [e.g., <5%] deviation across tested lifts.
* **Mechanical Enclosure Design:** Modeled and 3D-printed a snap-fit, impact-resistant housing in SolidWorks with a total mass of [e.g., 45 g], surviving [e.g., 50+] heavy barbell drops and high-vibration training sessions without structural failure.
* **Project Execution:** Managed the end-to-end development lifecycle—from schematic layout to physical MVP testing—applying structured resource allocation and milestone tracking from the Santander Project Management certification.

## System Architecture & Hardware

| Component | Specification / Role | Interface / Parameter |
| :--- | :--- | :--- |
| **Microcontroller** | Seeed Studio XIAO ESP32-C6 | 3.3V Logic, BLE 5.0 |
| **Inertial Sensor** | MPU-6050 (GY-521 Breakout) | I2C (Address `0x68`) |
| **Communication** | I
