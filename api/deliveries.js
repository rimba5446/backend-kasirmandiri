let app = require("express")();
let server = require("http").Server(app);
let bodyParser = require("body-parser");
let Datastore = require("nedb");

app.use(bodyParser.json());

module.exports = app;

// Use existing transactions database
let transactionsDB = new Datastore({
  filename: "./api/database/transactions.db",
  autoload: true
});

// Database for couriers
let couriersDB = new Datastore({
  filename: "./api/database/couriers.db",
  autoload: true
});

couriersDB.ensureIndex({ fieldName: '_id', unique: true });

app.get("/", function(req, res) {
  res.send("Deliveries API for Couriers");
});

// Get all pending deliveries (orders ready to be delivered)
// Status 1 = completed transaction, ready for delivery
app.get("/pending", function(req, res) {
  transactionsDB.find(
    { 
      $and: [
        { status: 1 }, // Completed transactions
        { $or: [
          { delivery_status: { $exists: false } },
          { delivery_status: "pending" }
        ]}
      ]
    },
    function(err, docs) {
      if (err) res.status(500).send(err);
      else res.send(docs);
    }
  );
});

// Get deliveries assigned to specific courier
app.get("/my-deliveries/:courierId", function(req, res) {
  transactionsDB.find(
    { 
      $and: [
        { courier_id: req.params.courierId },
        { delivery_status: { $in: ["validated", "in_transit"] } }
      ]
    },
    function(err, docs) {
      if (err) res.status(500).send(err);
      else res.send(docs);
    }
  );
});

// Get all deliveries for a courier (including history)
app.get("/courier-history/:courierId", function(req, res) {
  transactionsDB.find(
    { courier_id: req.params.courierId },
    function(err, docs) {
      if (err) res.status(500).send(err);
      else {
        // Sort by date, newest first
        docs.sort((a, b) => new Date(b.date) - new Date(a.date));
        res.send(docs);
      }
    }
  );
});

// Validate package before delivery (assign to courier)
app.post("/validate", function(req, res) {
  let { orderId, courierId, courierName } = req.body;
  
  if (!orderId || !courierId || !courierName) {
    return res.status(400).send({ error: "orderId, courierId, and courierName are required" });
  }

  // First check if order exists and is ready for delivery
  transactionsDB.findOne({ _id: orderId }, function(err, order) {
    if (err) return res.status(500).send(err);
    if (!order) return res.status(404).send({ error: "Order not found" });
    if (order.status !== 1) return res.status(400).send({ error: "Order is not completed yet" });
    
    // Update order with courier info and validation
    transactionsDB.update(
      { _id: orderId },
      { 
        $set: { 
          courier_id: courierId,
          courier_name: courierName,
          delivery_status: "validated",
          validated_at: new Date().toISOString()
        }
      },
      {},
      function(err, numReplaced) {
        if (err) res.status(500).send(err);
        else {
          transactionsDB.findOne({ _id: orderId }, function(err, updatedOrder) {
            res.send({ 
              success: true, 
              message: "Package validated successfully",
              order: updatedOrder
            });
          });
        }
      }
    );
  });
});

// Update delivery status
app.put("/update-status", function(req, res) {
  let { orderId, status, notes, coordinates } = req.body;
  
  if (!orderId || !status) {
    return res.status(400).send({ error: "orderId and status are required" });
  }

  let validStatuses = ["pending", "validated", "in_transit", "delivered", "failed"];
  if (!validStatuses.includes(status)) {
    return res.status(400).send({ error: "Invalid status" });
  }

  let updateData = { 
    delivery_status: status,
    updated_at: new Date().toISOString()
  };

  if (notes) updateData.delivery_notes = notes;
  if (coordinates) updateData.delivery_coordinates = coordinates;
  if (status === "delivered") updateData.delivered_at = new Date().toISOString();
  if (status === "in_transit" && !updateData.in_transit_at) {
    updateData.in_transit_at = new Date().toISOString();
  }

  transactionsDB.update(
    { _id: orderId },
    { $set: updateData },
    {},
    function(err, numReplaced) {
      if (err) res.status(500).send(err);
      else {
        transactionsDB.findOne({ _id: orderId }, function(err, updatedOrder) {
          res.send({ 
            success: true, 
            message: "Delivery status updated successfully",
            order: updatedOrder
          });
        });
      }
    }
  );
});

// Get specific delivery details
app.get("/delivery/:deliveryId", function(req, res) {
  transactionsDB.findOne({ _id: req.params.deliveryId }, function(err, doc) {
    if (err) res.status(500).send(err);
    else if (!doc) res.status(404).send({ error: "Delivery not found" });
    else res.send(doc);
  });
});

// Get delivery status for customer tracking
app.get("/track/:orderId", function(req, res) {
  transactionsDB.findOne({ _id: req.params.orderId }, function(err, doc) {
    if (err) res.status(500).send(err);
    else if (!doc) res.status(404).send({ error: "Order not found" });
    else {
      // Return only tracking-relevant information
      let trackingInfo = {
        orderId: doc._id,
        ref_number: doc.ref_number,
        status: doc.status,
        delivery_status: doc.delivery_status || "pending",
        courier_name: doc.courier_name || "Not assigned",
        validated_at: doc.validated_at,
        in_transit_at: doc.in_transit_at,
        delivered_at: doc.delivered_at,
        delivery_notes: doc.delivery_notes,
        date: doc.date
      };
      res.send(trackingInfo);
    }
  });
});

// Courier Management APIs

// Get all couriers
app.get("/couriers/all", function(req, res) {
  couriersDB.find({}, function(err, docs) {
    if (err) res.status(500).send(err);
    else res.send(docs);
  });
});

// Add new courier
app.post("/couriers/add", function(req, res) {
  let newCourier = req.body;
  
  if (!newCourier.name || !newCourier.phone) {
    return res.status(400).send({ error: "Name and phone are required" });
  }

  newCourier.created_at = new Date().toISOString();
  newCourier.active = true;

  couriersDB.insert(newCourier, function(err, courier) {
    if (err) res.status(500).send(err);
    else res.send({ success: true, courier: courier });
  });
});

// Get courier by ID
app.get("/couriers/:courierId", function(req, res) {
  couriersDB.findOne({ _id: req.params.courierId }, function(err, doc) {
    if (err) res.status(500).send(err);
    else if (!doc) res.status(404).send({ error: "Courier not found" });
    else res.send(doc);
  });
});

// Update courier info
app.put("/couriers/update", function(req, res) {
  let courierId = req.body._id;
  
  if (!courierId) {
    return res.status(400).send({ error: "Courier ID is required" });
  }

  couriersDB.update(
    { _id: courierId },
    req.body,
    {},
    function(err, numReplaced) {
      if (err) res.status(500).send(err);
      else res.send({ success: true, message: "Courier updated successfully" });
    }
  );
});
