'use strict';
class AppBootHook {
  constructor(app) {
    this.app = app;
  }
  async didReady() {
    console.log('启动')
  }

}
module.exports = AppBootHook;
