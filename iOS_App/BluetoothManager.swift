import Foundation
import CoreBluetooth

struct LiftRep: Identifiable {
    let id = UUID()
    let liftName: String
    let velocity: Double
    let rpe: Double
    let timestamp = Date()
}

class BluetoothManager: NSObject, ObservableObject {
    
    // UUIDs
    let serviceUUID = CBUUID(string: "4fafc201-1fb5-459e-8fcc-c5c9c331914b")
    let dataCharUUID = CBUUID(string: "beb5483e-36e1-4688-b7f5-ea07361b26a8")
    let cmdCharUUID = CBUUID(string: "5a7d3c90-951d-444a-8f5b-11c500732890")
    
    @Published var isConnected = false
    @Published var currentVelocity: Double = 0.0
    @Published var currentRPE: Double = 0.0
    @Published var currentLift: String = "Deadlift"
    
    @Published var isTrackingSet = false
    @Published var setReps: [LiftRep] = []
    @Published var historyReps: [LiftRep] = []
    
    private var centralManager: CBCentralManager!
    private var peripheral: CBPeripheral?
    private var dataCharacteristic: CBCharacteristic?
    private var cmdCharacteristic: CBCharacteristic?
    
    override init() {
        super.init()
        centralManager = CBCentralManager(delegate: self, queue: nil)
    }
    
    func toggleConnection() {
        if isConnected {
            if let peripheral = peripheral {
                centralManager.cancelPeripheralConnection(peripheral)
            }
        } else {
            if centralManager.state == .poweredOn {
                centralManager.scanForPeripherals(withServices: [serviceUUID], options: nil)
            }
        }
    }
    
    func sendLiftCommand(liftName: String) {
        guard let peripheral = peripheral, let cmdChar = cmdCharacteristic else { return }
        
        let cmdString: String
        switch liftName.lowercased() {
        case "squat": cmdString = "CMD:SL:SQ"
        case "bench": cmdString = "CMD:SL:BP"
        default: cmdString = "CMD:SL:DL"
        }
        
        if let data = cmdString.data(using: .utf8) {
            let writeType: CBCharacteristicWriteType = cmdChar.properties.contains(.writeWithoutResponse) ? .withoutResponse : .withResponse
            peripheral.writeValue(data, for: cmdChar, type: writeType)
            print("[VBT] Sent command: \(cmdString)")
        }
    }
    
    private func handleIncomingData(_ stringValue: String) {
        // Format: "Deadlift | 0.45 m/s | RPE: 8.5"
        let parts = stringValue.components(separatedBy: "|").map { $0.trimmingCharacters(in: .whitespaces) }
        guard parts.count == 3 else { return }
        
        let lift = parts[0]
        
        // Extract numbers
        let velPattern = "([\\d.]+)"
        let rpePattern = "([\\d.]+)"
        
        func extractNumber(from string: String, pattern: String) -> Double? {
            guard let regex = try? NSRegularExpression(pattern: pattern),
                  let match = regex.firstMatch(in: string, range: NSRange(string.startIndex..., in: string)),
                  let range = Range(match.range(at: 1), in: string) else { return nil }
            return Double(String(string[range]))
        }
        
        guard let velocity = extractNumber(from: parts[1], pattern: velPattern),
              let rpe = extractNumber(from: parts[2], pattern: rpePattern) else { return }
        
        let rep = LiftRep(liftName: lift, velocity: velocity, rpe: rpe)
        
        DispatchQueue.main.async {
            self.currentLift = lift
            self.currentVelocity = velocity
            self.currentRPE = rpe
            
            if self.isTrackingSet {
                self.setReps.append(rep)
            }
            self.historyReps.insert(rep, at: 0)
        }
    }
}

extension BluetoothManager: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state == .poweredOn {
            // Ready to scan
        } else {
            DispatchQueue.main.async {
                self.isConnected = false
            }
        }
    }
    
    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String : Any], rssi RSSI: NSNumber) {
        self.peripheral = peripheral
        self.peripheral?.delegate = self
        centralManager.stopScan()
        centralManager.connect(peripheral, options: nil)
    }
    
    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        DispatchQueue.main.async {
            self.isConnected = true
        }
        peripheral.discoverServices([serviceUUID])
    }
    
    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        DispatchQueue.main.async {
            self.isConnected = false
            self.dataCharacteristic = nil
            self.cmdCharacteristic = nil
            self.peripheral = nil
        }
    }
}

extension BluetoothManager: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard let services = peripheral.services else { return }
        for service in services {
            peripheral.discoverCharacteristics([dataCharUUID, cmdCharUUID], for: service)
        }
    }
    
    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard let characteristics = service.characteristics else { return }
        for characteristic in characteristics {
            if characteristic.uuid == dataCharUUID {
                self.dataCharacteristic = characteristic
                peripheral.setNotifyValue(true, for: characteristic)
            } else if characteristic.uuid == cmdCharUUID {
                self.cmdCharacteristic = characteristic
            }
        }
    }
    
    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        if characteristic.uuid == dataCharUUID, let data = characteristic.value {
            if let stringValue = String(data: data, encoding: .utf8) {
                handleIncomingData(stringValue)
            }
        }
    }
}
