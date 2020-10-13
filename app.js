var saferMeService = 0xffa1;

function $(x) {
  return document.getElementById(x);
}

var log = console.log;

var app = {
  async signIn($event) {
    $event.target.email.disabled = true;
    $event.target.password.disabled = true;
    $event.target.signinbtn.disabled  = true;

    const email = $event.target.email.value;
    const password = $event.target.password.value;

    try {
      const response = await fetch("https://api1.thundermaps.com/api/v3/sessions?fields=installation_id,client_uuid", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-AppID": "com.thundermaps.saferme",
          "X-Platform": "btk"
        },
        body: JSON.stringify({user: {email, password}}),
      });
      if (response.ok) {
        this.sessionData = await response.json();
        localStorage.setItem("btkSession", JSON.stringify(this.sessionData));
        this.displaySession();
      }
    }
    catch(e) {
      console.log(e);
    }

    $event.target.email.disabled = false;
    $event.target.password.disabled = false;
    $event.target.signinbtn.disabled  = false;
  },

  init() {
    try {
      this.sessionData = JSON.parse(localStorage.getItem("btkSession"));
      if (this.sessionData?.user_id) {
        this.displaySession();
      }
    }
    catch (e) {
      console.log(e);
    }
  },

  logout() {
    localStorage.removeItem('btkSession');
    location.reload();
  },

  displaySession() {
    $('login-form').hidden = true;
    $('session').hidden = false;
    $('session-data').innerHTML = `
      userId: ${this.sessionData.user_id}<br>
      client_uuid: ${this.sessionData.client_uuid}<br>
    `;
  },

  async fetchDevice() {
    if (this.device) {
      return this.device;
    }

    log('Requesting any Bluetooth Device...');
    const device = await navigator.bluetooth.requestDevice({
      filters: [{
        services: [saferMeService],
      }],
      optionalServices: ['battery_service'],
    })
    this.device = device;
    $('device-paired').innerHTML = `${device.name} (${device.id})`;
    return this.device;
  },

  async fetchServer() {
    if (this.server) {
      return this.server;
    }
    log('Connecting to GATT Server...');
    const device = await this.fetchDevice();
    const server = await device.gatt.connect();
    this.server = server;
    $('device-connected').innerHTML = `Yes`;
    return this.server;
  },

  async fetchBatteryService() {
    if (this.batteryService) {
      return this.batteryService;
    }
    log('Getting Battery Service...');
    const server = await this.fetchServer();
    const service = await server.getPrimaryService('battery_service');
    this.batteryService = service;
    return this.batteryService
  },

  async fetchBatteryLevelChar() {
    if (this.batteryLevelChar) {
      return this.batteryLevelChar;
    }
    log('Getting Battery Characteristic...');
    const batteryService = await this.fetchBatteryService();
    const characteristic = await batteryService.getCharacteristic('battery_level');
    this.batteryLevelChar = characteristic;
    return this.batteryLevelChar
  },

  async reloadBatteryInfo() {
    const server = await this.fetchServer();

    const handleBatteryLevelChanged = (event) => {
      console.log("batery: ", event);
      const batteryLevelDec = event.target.value.getUint8(0);
      $('battery-level').innerHTML = `${batteryLevelDec}%`;
    };

    try {
      log('Getting Battery Characteristic...');
      const batteryLevelChar = await this.fetchBatteryLevelChar();

      batteryLevelChar.startNotifications();
      batteryLevelChar.addEventListener('characteristicvaluechanged', handleBatteryLevelChanged);

      const reading = await batteryLevelChar.readValue();
      const batteryLevelDec = reading.getUint8(0);
      $('battery-level').innerHTML = `${batteryLevelDec}%`;
    }
    catch (error) {
      console.error(error);
    }
  },

  async fetchContactLogService() {
    if (this.contactLogService) {
      return this.contactLogService;
    }
    log('Getting Contact Log Service...');
    const server = await this.fetchServer();
    const service = await server.getPrimaryService(saferMeService);
    this.contactLogService = service;
    return this.contactLogService;
  },

  async fetchActivationChar() {
    if (this.activationChar) {
      return this.activationChar;
    }
    log('Getting Activation Characteristic...');
    const service = await this.fetchContactLogService();
    const characteristic = await service.getCharacteristic('24fd71a0-2008-4c9e-9ea2-e19402dc51e2');
    this.activationChar = characteristic;
    return this.activationChar;
  },

  async fetchStatusChar() {
    if (this.statusChar) {
      return this.statusChar;
    }
    log('Getting Status Characteristic...');
    const service = await this.fetchContactLogService();
    const characteristic = await service.getCharacteristic('24fd719f-2008-4c9e-9ea2-e19402dc51e2');
    this.statusChar = characteristic;
    return this.statusChar;
  },

  async requestStatusUpdate() {
    await this.sendActivation("upst");

    const statusChar = await this.fetchStatusChar();

    // statusChar.startNotifications();
    // statusChar.addEventListener('characteristicvaluechanged', handleStatusChanged);

    const reading = await statusChar.readValue();
    const status = new TextDecoder('utf-8').decode(reading)
    $('btk-status').innerHTML = status;
  },

  async syncBtk() {
    const now = new Date().toJSON().replace(/\.[0-9]+(Z|\+.*)/, "$1");
    await this.sendActivation(`act:${this.sessionData.client_uuid}:${now}`);
  },

  async unsyncBtk() {
    await this.sendActivation(`act:0`);
  },

  async sendActivation(activation) {
    const characteristic = await this.fetchActivationChar();
    const msg = new TextEncoder('utf-8').encode(activation);
    return await characteristic.writeValue(msg);
  },
}
