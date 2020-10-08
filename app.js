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

  async pair() {
    try {
      log('Requesting any Bluetooth Device...');
      const device = await navigator.bluetooth.requestDevice({
        filters: [{
          // services: [saferMeService]
          services: ['battery_service'],
          optionalServices: [0xffa1],
        }],
        // acceptAllDevices: true,
        // optionalServices: [saferMeService],
      })
      this.device = device;
      $('device-paired').innerHTML = `${device.name} (${device.id})`;
    }
    catch(error) {
      console.error(error);
    }

    try {
      log('Connecting to GATT Server...');
      const server = await this.device.gatt.connect();
      this.server = server;
      $('device-connected').innerHTML = `Yes`;
    }
    catch (error) {
      console.error(error);
    }

    try {
      log('Getting Battery Service...');
      const service = await this.server.getPrimaryService('battery_service');
      this.battery_service = service;
    }
    catch (error) {
      console.error(error);
    }

    const handleBatteryLevelChanged = (event) => {
      console.log("batery: ", event);
      const batteryLevelDec = event.target.value.getUint8(0);
      $('battery-level').innerHTML = `${batteryLevelDec}%`;
    };

    try {
      log('Getting Battery Characteristic...');
      const characteristic = await this.battery_service.getCharacteristic('battery_level');
      this.characteristic = characteristic;

      characteristic.startNotifications();

      characteristic.addEventListener('characteristicvaluechanged', handleBatteryLevelChanged);

      const reading = await characteristic.readValue();
      const batteryLevelDec = reading.getUint8(0);
      $('battery-level').innerHTML = `${batteryLevelDec}%`;
    }
    catch (error) {
      console.error(error);
    }
  },

  async loadContactLogService() {
    if (!this.contact_log_service) {
      try {
        log('Getting Contact Log Service...');
        const service = await this.server.getPrimaryService(0xffa1);
        this.contact_log_service = service;
      }
      catch (error) {
        console.error(error);
      }
    }
    return this.contact_log_service;
  },


  async requestStatusUpdate() {
    await this.sendActivation("upst:a")

    // const handleStatusChanged = (event) => {
    //   console.log("status: ", event);
    //   const status = event.target.value.getUint8(0);
    //   $('btk-status').innerHTML = `${status}%`;
    // };

    if (!this.statusCharacteristic) {
      try {
        log('Getting Status Characteristic...');
        this.statusCharacteristic = await this.contact_log_service.getCharacteristic('24fd719f-2008-4c9e-9ea2-e19402dc51e2');
      }
      catch (e) {
        console.error(e);
      }
    }

    // this.statusCharacteristic.startNotifications();

    // this.statusCharacteristic.addEventListener('characteristicvaluechanged', handleStatusChanged);

    try {
      const reading = await this.statusCharacteristic.readValue();
      const status = new TextDecoder('utf-8').decode(reading)
      $('btk-status').innerHTML = status;
    }
    catch (error) {
      console.error(error);
    }
  },

  async syncBtk() {
    const now = new Date().toJSON().replace(/\.[0-9]+(Z|\+.*)/, "$1");
    await this.sendActivation(`act:${this.sessionData.client_uuid}:${now}`);
  },

  async unsyncBtk() {
    await this.sendActivation(`act:0`);
  },

  async sendActivation(activation) {
    await this.loadContactLogService();

    if (!this.activationCharacteristic) {
      try {
        log('Getting Activation Characteristic...');
        this.activationCharacteristic = await this.contact_log_service.getCharacteristic('24fd71a0-2008-4c9e-9ea2-e19402dc51e2');
      }
      catch (e) {
        console.error(e);
      }
    }

    try {
      const msg = new TextEncoder('utf-8').encode(activation)
      return await this.activationCharacteristic.writeValue(msg);
    }
    catch (error) {
      console.error(error);
    }

  },

}
