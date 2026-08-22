const EventEmitter = require('events');

const userEvents = new EventEmitter();
userEvents.setMaxListeners(1000);

module.exports = userEvents;
