let app = require("express")();
let server = require("http").Server(app);
let bodyParser = require("body-parser");
let Datastore = require("nedb");

app.use(bodyParser.json());

module.exports = app;

let deliveryDB = new Datastore({
  filename: "./api/database/delivery.db",
  autoload: true
});

deliveryDB.ensureIndex({ fieldName: '_id', unique: true });

app.get("/", function(req, res) {
  res.send("Delivery API");
});

// Get all deliveries
app.get("/all", function(req, res) {
  deliveryDB.find({}, function(err, docs) {
    if (err) res.status(500).send(err);
    else res.send(docs);
  });
});

// Get pending deliveries (status 0 or 1 or 2)
app.get("/pending", function(req, res) {
  deliveryDB.find(
    { status: { $in: [0, 1, 2] } },
    function(err, docs) {
      if (err) res.status(500).send(err);
      else res.send(docs);
    }
  ).sort({ created_at: -1 });
});

// Get deliveries by courier
app.get("/by-courier/:courierId", function(req, res) {
  deliveryDB.find(
    { courier_id: req.params.courierId },
    function(err, docs) {
      if (err) res.status(500).send(err);
      else res.send(docs);
    }
  ).sort({ created_at: -1 });
});

// Get pending deliveries by courier
app.get("/by-courier/:courierId/pending", function(req, res) {
  deliveryDB.find(
    { 
      $and: [
        { courier_id: req.params.courierId },
        { status: { $in: [0, 1, 2] } }
      ]
    },
    function(err, docs) {
      if (err) res.status(500).send(err);
      else res.send(docs);
    }
  ).sort({ created_at: -1 });
});

// Create new delivery
app.post("/new", function(req, res) {
  let newDelivery = req.body;
  
  // Generate validation code (6 digit random number)
  newDelivery.validation_code = Math.floor(100000 + Math.random() * 900000).toString();
  newDelivery.status = 0; // pending
  newDelivery.created_at = new Date().toJSON();
  newDelivery.updated_at = new Date().toJSON();
  
  deliveryDB.insert(newDelivery, function(err, delivery) {
    if (err) res.status(500).send(err);
    else res.status(200).send(delivery);
  });
});

// Validate package before delivery
app.post("/validate", function(req, res) {
  let deliveryId = req.body.delivery_id;
  let validationCode = req.body.validation_code;
  
  deliveryDB.findOne({ _id: deliveryId }, function(err, delivery) {
    if (err) {
      res.status(500).send(err);
    } else if (!delivery) {
      res.status(404).send({ success: false, message: "Delivery not found" });
    } else if (delivery.validation_code !== validationCode) {
      res.status(400).send({ success: false, message: "Invalid validation code" });
    } else {
      // Update status to picked (1) and set validated_at
      deliveryDB.update(
        { _id: deliveryId },
        { 
          $set: { 
            status: 1, 
            validated_at: new Date().toJSON(),
            picked_at: new Date().toJSON(),
            updated_at: new Date().toJSON()
          } 
        },
        {},
        function(err, numReplaced) {
          if (err) res.status(500).send(err);
          else res.status(200).send({ success: true, message: "Package validated successfully", delivery: delivery });
        }
      );
    }
  });
});

// Update delivery status
app.put("/update-status", function(req, res) {
  let deliveryId = req.body.delivery_id;
  let newStatus = req.body.status;
  let notes = req.body.notes || "";
  
  let updateData = {
    status: newStatus,
    notes: notes,
    updated_at: new Date().toJSON()
  };
  
  // Set timestamp based on status
  if (newStatus === 2) {
    updateData.on_delivery_at = new Date().toJSON();
  } else if (newStatus === 3) {
    updateData.delivered_at = new Date().toJSON();
  } else if (newStatus === 4) {
    updateData.failed_at = new Date().toJSON();
  }
  
  deliveryDB.update(
    { _id: deliveryId },
    { $set: updateData },
    {},
    function(err, numReplaced) {
      if (err) res.status(500).send(err);
      else res.status(200).send({ success: true, message: "Status updated successfully" });
    }
  );
});

// Get delivery by ID
app.get("/:deliveryId", function(req, res) {
  deliveryDB.findOne({ _id: req.params.deliveryId }, function(err, doc) {
    if (err) res.status(500).send(err);
    else if (!doc) res.status(404).send({ message: "Delivery not found" });
    else res.send(doc);
  });
});

// Delete delivery
app.delete("/:deliveryId", function(req, res) {
  deliveryDB.remove({ _id: req.params.deliveryId }, function(err, numRemoved) {
    if (err) res.status(500).send(err);
    else res.sendStatus(200);
  });
});
