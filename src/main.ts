import { UI } from './ui'
import { Serial } from './serial'
import './style.css'

const App = {
  init(): void {
    UI.init()
    UI.onConnect = () => this.connect()
    UI.onDisconnect = () => this.disconnect()
    UI.onNavigate = (view) => this.navigate(view)

    Serial.onStatus = (connected) => UI.setConnected(connected)

    UI.renderLanding()
  },

  async connect(): Promise<void> {
    await Serial.connect()
  },

  async disconnect(): Promise<void> {
    await Serial.disconnect()
  },

  navigate(view: string): void {
    switch (view) {
      case 'landing':
        UI.renderLanding()
        break
      case 'quick-check':
        // Task 8
        break
      case 'guided':
        // Task 9
        break
      case 'live-monitor':
        // Task 10
        break
      case 'report':
        // Task 11
        break
    }
  },
}

App.init()
