// init.js

// Wait a bit to let the server start
sleep(3000);

// Initialize replica set
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "localhost:27017" }
  ]
});