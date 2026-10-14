import SwiftUI

struct ContentView: View {
    @StateObject private var bleManager = BluetoothManager()
    @State private var selectedTab = 0
    @State private var showLiftDropdown = false
    
    @State private var orbOffset: CGFloat = 0.4
    @State private var isGlowActive = false
    
    var themeColor: Color {
        switch bleManager.currentLift.lowercased() {
        case "squat": return Color(hex: "00FF66")
        case "bench": return Color(hex: "00E5FF")
        default: return Color(hex: "FF0055")
        }
    }
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            VStack(spacing: 20) {
                // Header
                HStack {
                    Text("VBT")
                        .font(.system(size: 24, weight: .black))
                        .foregroundColor(.white)
                    + Text(" PRO_")
                        .font(.system(size: 24, weight: .black))
                        .foregroundColor(themeColor)
                    
                    Spacer()
                    
                    Text(bleManager.isConnected ? "CONNECTED" : "DISCONNECTED")
                        .font(.system(size: 11, weight: .semibold))
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(bleManager.isConnected ? themeColor : Color(white: 0.15))
                        .foregroundColor(bleManager.isConnected ? .black : .gray)
                        .clipShape(Capsule())
                }
                .padding(.horizontal)
                
                // Tabs Content
                TabView(selection: $selectedTab) {
                    LiveTrackerView(bleManager: bleManager, themeColor: themeColor, showLiftDropdown: $showLiftDropdown, orbOffset: $orbOffset, isGlowActive: $isGlowActive)
                        .tag(0)
                    
                    SetTrackingView(bleManager: bleManager, themeColor: themeColor)
                        .tag(1)
                    
                    HistoryView(bleManager: bleManager, themeColor: themeColor)
                        .tag(2)
                }
                .tabViewStyle(PageTabViewStyle(indexDisplayMode: .never))
                
                // Custom Tab Bar
                HStack {
                    TabBarButton(icon: "record.circle", label: "Live", tabIndex: 0, selectedTab: $selectedTab, themeColor: themeColor)
                    TabBarButton(icon: "circle", label: "Set", tabIndex: 1, selectedTab: $selectedTab, themeColor: themeColor)
                    TabBarButton(icon: "list.clipboard", label: "History", tabIndex: 2, selectedTab: $selectedTab, themeColor: themeColor)
                }
                .padding()
                .background(Color(white: 0.07).opacity(0.9))
                .clipShape(RoundedRectangle(cornerRadius: 24))
                .padding(.horizontal)
            }
        }
        .onChange(of: bleManager.currentVelocity) { newVelocity in
            if newVelocity > 0 {
                triggerPhysicsAnimation(velocity: newVelocity)
            }
        }
        .overlay(
            // Custom Dropdown Overlay
            Group {
                if showLiftDropdown {
                    Color.black.opacity(0.5).ignoresSafeArea().onTapGesture { showLiftDropdown = false }
                    VStack {
                        Spacer()
                        VStack(spacing: 0) {
                            ForEach(["Deadlift", "Squat", "Bench"], id: \.self) { lift in
                                Button(action: {
                                    bleManager.currentLift = lift
                                    bleManager.sendLiftCommand(liftName: lift)
                                    showLiftDropdown = false
                                }) {
                                    Text(lift.uppercased())
                                        .font(.system(size: 16, weight: .bold))
                                        .foregroundColor(bleManager.currentLift.lowercased() == lift.lowercased() ? themeColor : .gray)
                                        .frame(maxWidth: .infinity)
                                        .padding()
                                        .background(Color(white: 0.1))
                                }
                                Divider().background(Color.gray.opacity(0.3))
                            }
                        }
                        .cornerRadius(12)
                        .padding()
                        Spacer()
                    }
                }
            }
        )
    }
    
    private func triggerPhysicsAnimation(velocity: Double) {
        var duration = (0.5 / velocity) * 2
        duration = max(0.6, min(duration, 6.0))
        
        let isDeadlift = bleManager.currentLift.lowercased() == "deadlift"
        let apexDelay = isDeadlift ? duration / 2 : duration
        
        let startOffset: CGFloat = isDeadlift ? 0.4 : -0.4
        let apexOffset: CGFloat = isDeadlift ? -0.4 : 0.4
        
        orbOffset = startOffset
        
        withAnimation(.timingCurve(0.25, 1, 0.5, 1, duration: duration / 2)) {
            orbOffset = apexOffset
        }
        
        DispatchQueue.main.asyncAfter(deadline: .now() + (duration / 2)) {
            withAnimation(.timingCurve(0.25, 1, 0.5, 1, duration: duration / 2)) {
                orbOffset = startOffset
            }
        }
        
        // Apex Glow Animation
        DispatchQueue.main.asyncAfter(deadline: .now() + apexDelay) {
            isGlowActive = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                isGlowActive = false
            }
        }
    }
}

// MARK: - Subviews

struct LiveTrackerView: View {
    @ObservedObject var bleManager: BluetoothManager
    var themeColor: Color
    @Binding var showLiftDropdown: Bool
    
    @Binding var orbOffset: CGFloat
    @Binding var isGlowActive: Bool
    
    var body: some View {
        VStack(spacing: 20) {
            Button(action: {
                bleManager.toggleConnection()
            }) {
                ZStack {
                    RoundedRectangle(cornerRadius: 16).fill(Color(white: 0.07)).overlay(
                        RoundedRectangle(cornerRadius: 16).stroke(bleManager.isConnected ? themeColor : Color.gray, lineWidth: 1)
                    )
                    Text(bleManager.isConnected ? "DISCONNECT" : "CONNECT SENSOR")
                        .font(.system(size: 16, weight: .heavy))
                        .foregroundColor(.white)
                }
                .frame(height: 60)
            }
            .padding(.horizontal)
            
            HStack {
                Button(action: { showLiftDropdown = true }) {
                    HStack {
                        Text(bleManager.currentLift.uppercased())
                        Spacer()
                        Image(systemName: "chevron.down")
                    }
                    .font(.system(size: 14, weight: .heavy))
                    .padding()
                    .frame(height: 54)
                    .background(Color(white: 0.07))
                    .cornerRadius(12)
                    .foregroundColor(.white)
                }
                
                Button(action: { bleManager.isTrackingSet.toggle() }) {
                    Text(bleManager.isTrackingSet ? "END SET" : "START SET")
                        .font(.system(size: 14, weight: .heavy))
                        .frame(maxWidth: .infinity)
                        .frame(height: 54)
                        .background(bleManager.isTrackingSet ? themeColor : Color(white: 0.07))
                        .foregroundColor(bleManager.isTrackingSet ? .black : .white)
                        .cornerRadius(12)
                }
            }
            .padding(.horizontal)
            
            Spacer()
            
            HStack(spacing: 0) {
                VStack(alignment: .leading) {
                    Text("VELOCITY").font(.system(size: 11, weight: .semibold)).foregroundColor(.gray)
                    Text(String(format: "%.2f", bleManager.currentVelocity))
                        .font(.system(size: 42, weight: .black))
                    Text("m/s").font(.system(size: 14, weight: .semibold)).foregroundColor(themeColor)
                }
                .frame(width: 100, alignment: .leading)
                
                Spacer()
                
                // Bar Path Visualizer
                GeometryReader { geo in
                    ZStack {
                        Capsule().fill(Color(white: 0.15)).frame(width: 2)
                        
                        Circle()
                            .fill(Color.white)
                            .frame(width: 16, height: 16)
                            .shadow(color: themeColor, radius: 10)
                            .offset(y: geo.size.height * orbOffset)
                        
                        Circle()
                            .fill(themeColor)
                            .frame(width: 50, height: 50)
                            .blur(radius: 10)
                            .offset(y: geo.size.height * -0.4) // Approximate Zenith
                            .opacity(isGlowActive ? 0.8 : 0)
                            .scaleEffect(isGlowActive ? 2.5 : 0.2)
                            .animation(.easeOut(duration: 0.6), value: isGlowActive)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                .frame(width: 50)
                
                Spacer()
                
                VStack(alignment: .trailing) {
                    Text("EST RPE").font(.system(size: 11, weight: .semibold)).foregroundColor(.gray)
                    Text(String(format: "%.1f", bleManager.currentRPE))
                        .font(.system(size: 42, weight: .black))
                    Text("/ 10").font(.system(size: 14, weight: .semibold)).foregroundColor(themeColor)
                }
                .frame(width: 100, alignment: .trailing)
            }
            .padding(.horizontal)
            .frame(height: 240)
            
            Spacer()
        }
    }
}

struct SetTrackingView: View {
    @ObservedObject var bleManager: BluetoothManager
    var themeColor: Color
    
    var avgVel: Double {
        if bleManager.setReps.isEmpty { return 0 }
        return bleManager.setReps.map(\.velocity).reduce(0, +) / Double(bleManager.setReps.count)
    }
    
    var maxVel: Double {
        bleManager.setReps.map(\.velocity).max() ?? 0
    }
    
    var avgRPE: Double {
        if bleManager.setReps.isEmpty { return 0 }
        return bleManager.setReps.map(\.rpe).reduce(0, +) / Double(bleManager.setReps.count)
    }
    
    var body: some View {
        VStack(spacing: 24) {
            HStack {
                Text("ACTIVE SET")
                Spacer()
                Text("\(bleManager.setReps.count) REPS")
            }
            .font(.system(size: 12, weight: .heavy))
            .foregroundColor(themeColor)
            .padding(.horizontal, 30)
            
            ZStack {
                Circle()
                    .stroke(Color(white: 0.15), lineWidth: 8)
                
                Circle()
                    .trim(from: 0.0, to: min(CGFloat(avgVel / 1.0), 1.0))
                    .stroke(themeColor, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .shadow(color: themeColor, radius: 10)
                    .animation(.linear, value: avgVel)
                
                VStack(spacing: 4) {
                    Text(bleManager.setReps.isEmpty ? "-" : String(format: "%.2f", avgVel))
                        .font(.system(size: 42, weight: .black))
                        .foregroundColor(.white)
                    Text("AVG M/S")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.gray)
                }
            }
            .frame(width: 200, height: 200)
            
            HStack(spacing: 48) {
                VStack {
                    Text(bleManager.setReps.isEmpty ? "-" : String(format: "%.2f", maxVel)).font(.system(size: 20, weight: .black))
                    Text("MAX M/S").font(.system(size: 10, weight: .semibold)).foregroundColor(.gray)
                }
                VStack {
                    Text(bleManager.setReps.isEmpty ? "-" : String(format: "%.1f", avgRPE)).font(.system(size: 20, weight: .black))
                    Text("AVG RPE").font(.system(size: 10, weight: .semibold)).foregroundColor(.gray)
                }
            }
            .padding(24)
            .background(Color(white: 0.07))
            .cornerRadius(20)
            .padding(.horizontal, 30)
            
            Spacer()
        }
    }
}

struct HistoryView: View {
    @ObservedObject var bleManager: BluetoothManager
    var themeColor: Color
    
    var body: some View {
        VStack {
            Text("SESSION HISTORY")
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.gray)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal)
            
            if bleManager.historyReps.isEmpty {
                Text("No reps recorded yet.")
                    .foregroundColor(.gray)
                    .padding(.top, 50)
            } else {
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(Array(bleManager.historyReps.enumerated()), id: \.element.id) { index, rep in
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(rep.liftName).font(.system(size: 15, weight: .heavy))
                                    Text("REP \(bleManager.historyReps.count - index) • \(rep.timestamp, style: .time)").font(.system(size: 12)).foregroundColor(.gray)
                                }
                                Spacer()
                                HStack(spacing: 24) {
                                    VStack(alignment: .trailing) {
                                        Text(String(format: "%.2f", rep.velocity)).font(.system(size: 18, weight: .heavy)).foregroundColor(themeColor)
                                        Text("m/s").font(.system(size: 10)).foregroundColor(.gray)
                                    }
                                    VStack(alignment: .trailing) {
                                        Text(String(format: "%.1f", rep.rpe)).font(.system(size: 18, weight: .heavy)).foregroundColor(themeColor)
                                        Text("RPE").font(.system(size: 10)).foregroundColor(.gray)
                                    }
                                }
                            }
                            .padding()
                            .background(Color(white: 0.07))
                            .cornerRadius(12)
                        }
                    }
                    .padding(.horizontal)
                }
            }
            Spacer()
        }
    }
}

// MARK: - Helpers

struct TabBarButton: View {
    var icon: String
    var label: String
    var tabIndex: Int
    @Binding var selectedTab: Int
    var themeColor: Color
    
    var body: some View {
        Button(action: { selectedTab = tabIndex }) {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                Text(label.uppercased())
                    .font(.system(size: 10, weight: .bold))
            }
            .foregroundColor(selectedTab == tabIndex ? themeColor : .gray)
            .frame(maxWidth: .infinity)
        }
    }
}

extension Color {
    init(hex: String) {
        let scanner = Scanner(string: hex)
        var rgbValue: UInt64 = 0
        scanner.scanHexInt64(&rgbValue)
        let r = Double((rgbValue & 0xFF0000) >> 16) / 255.0
        let g = Double((rgbValue & 0x00FF00) >> 8) / 255.0
        let b = Double(rgbValue & 0x0000FF) / 255.0
        self.init(red: r, green: g, blue: b)
    }
}
