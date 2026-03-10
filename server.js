import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("hospital.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    type TEXT,
    status TEXT DEFAULT 'available'
  );

  CREATE TABLE IF NOT EXISTS beds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER,
    status TEXT DEFAULT 'available',
    patient_name TEXT,
    FOREIGN KEY(room_id) REFERENCES rooms(id)
  );

  CREATE TABLE IF NOT EXISTS equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    status TEXT DEFAULT 'available',
    patient_name TEXT,
    location TEXT
  );
  
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT,
  level TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  age INTEGER,
  disease TEXT,
  bed_id INTEGER,
  equipment_id INTEGER,
  admission_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'admitted'
);


`);

// Seed initial data if empty
const userCount = db.prepare("SELECT count(*) as count FROM users").get();
if (userCount.count === 0) {
  db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)").run("admin", "admin123", "staff");
  
  const rooms = [
    { name: "ICU-A", type: "ICU" },
    { name: "ER-1", type: "Emergency" },
    { name: "Gen-101", type: "General" },
  ];
  rooms.forEach(r => db.prepare("INSERT INTO rooms (name, type) VALUES (?, ?)").run(r.name, r.type));

  for (let i = 1; i <= 5; i++) {
    db.prepare("INSERT INTO beds (room_id, status) VALUES (?, ?)").run(1, "available");
  }

  const equip = ["Ventilator", "Defibrillator", "Patient Monitor", "Infusion Pump"];
  equip.forEach(e => db.prepare("INSERT INTO equipment (name, location) VALUES (?, ?)").run(e, "Storage"));
}

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

app.use(express.json());

// Serve static files from root
app.use(express.static(__dirname));

// WebSocket broadcasting
const broadcast = (data) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
};

const broadcastResources = () => {
  const rooms = db.prepare("SELECT * FROM rooms").all();
  const beds = db.prepare("SELECT * FROM beds").all();
  const equipment = db.prepare("SELECT * FROM equipment").all();
  broadcast({ type: "UPDATE_RESOURCES", data: { rooms, beds, equipment } });
};

// API Routes
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE username = ? AND password = ?").get(username, password);
  if (user) {
    res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
  } else {
    res.status(401).json({ success: false, message: "Invalid credentials" });
  }
});

app.get("/api/resources", (req, res) => {
  const rooms = db.prepare("SELECT * FROM rooms").all();
  const beds = db.prepare("SELECT * FROM beds").all();
  const equipment = db.prepare("SELECT * FROM equipment").all();
  res.json({ rooms, beds, equipment });
});

app.post("/api/beds/update", (req, res) => {
  const { id, status, patient_name } = req.body;
  db.prepare("UPDATE beds SET status = ?, patient_name = ? WHERE id = ?").run(status, patient_name || null, id);
  broadcastResources();
  res.json({ success: true });
});

app.post("/api/equipment/update", (req, res) => {
  const { id, status, patient_name, location } = req.body;
  db.prepare("UPDATE equipment SET status = ?, patient_name = ?, location = ? WHERE id = ?").run(status, patient_name || null, location, id);
  broadcastResources();
  res.json({ success: true });
});

app.post("/api/rooms/update", (req, res) => {
  const { id, status } = req.body;
  db.prepare("UPDATE rooms SET status = ? WHERE id = ?").run(status, id);
  broadcastResources();
  res.json({ success: true });
});

app.post("/api/rooms/add", (req, res) => {
  const { name, type } = req.body;
  db.prepare("INSERT INTO rooms (name, type) VALUES (?, ?)").run(name, type);
  broadcastResources();
  res.json({ success: true });
});

app.post("/api/beds/add", (req, res) => {
  const { room_id } = req.body;
  db.prepare("INSERT INTO beds (room_id) VALUES (?)").run(room_id);
  broadcastResources();
  res.json({ success: true });
});
app.post("/api/patients/admit", (req, res) => {

  const { name, age, disease, bed_id, equipment_id } = req.body;

  db.prepare(`
    INSERT INTO patients (name, age, disease, bed_id, equipment_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, age, disease, bed_id, equipment_id);

  // mark bed occupied
  db.prepare(`
    UPDATE beds SET status='occupied', patient_name=?
    WHERE id=?
  `).run(name, bed_id);

  if (equipment_id) {
    db.prepare(`
      UPDATE equipment SET status='occupied', patient_name=?
      WHERE id=?
    `).run(name, equipment_id);
  }

  broadcastResources();

  res.json({ success: true });

});
app.post("/api/patients/discharge", (req, res) => {

  const { patient_id, bed_id, equipment_id } = req.body;

  db.prepare(`
    UPDATE patients SET status='discharged'
    WHERE id=?
  `).run(patient_id);

  db.prepare(`
    UPDATE beds SET status='available', patient_name=NULL
    WHERE id=?
  `).run(bed_id);

  if (equipment_id) {
    db.prepare(`
      UPDATE equipment SET status='available', patient_name=NULL
      WHERE id=?
    `).run(equipment_id);
  }

  broadcastResources();

  res.json({ success: true });

});
app.get("/api/patients", (req, res) => {

  const patients = db.prepare(`
    SELECT * FROM patients ORDER BY admission_date DESC
  `).all();

  res.json(patients);

});
app.get("/api/analytics", (req, res) => {

  const totalRooms = db.prepare("SELECT COUNT(*) as count FROM rooms").get().count;

  const totalBeds = db.prepare("SELECT COUNT(*) as count FROM beds").get().count;

  const occupiedBeds = db.prepare(
    "SELECT COUNT(*) as count FROM beds WHERE status='occupied'"
  ).get().count;

  const availableBeds = db.prepare(
    "SELECT COUNT(*) as count FROM beds WHERE status='available'"
  ).get().count;

  const totalEquipment = db.prepare(
    "SELECT COUNT(*) as count FROM equipment"
  ).get().count;

  const occupiedEquipment = db.prepare(
    "SELECT COUNT(*) as count FROM equipment WHERE status='occupied'"
  ).get().count;

  const patients = db.prepare(
    "SELECT COUNT(*) as count FROM patients WHERE status='admitted'"
  ).get().count;

  const occupancyRate =
    totalBeds === 0 ? 0 : Math.round((occupiedBeds / totalBeds) * 100);

  res.json({
    totalRooms,
    totalBeds,
    occupiedBeds,
    availableBeds,
    totalEquipment,
    occupiedEquipment,
    patients,
    occupancyRate
  });

});
app.post("/api/patients/admit", (req, res) => {

  const { name, age, disease, bed_id } = req.body;

  db.prepare(`
    INSERT INTO patients (name, age, disease, bed_id)
    VALUES (?, ?, ?, ?)
  `).run(name, age, disease, bed_id);

  db.prepare(`
    UPDATE beds
    SET status='occupied', patient_name=?
    WHERE id=?
  `).run(name, bed_id);

  broadcastResources();

  res.json({ success: true });

});
app.get("/api/patients", (req, res) => {

  const patients = db.prepare(`
    SELECT * FROM patients
    ORDER BY admission_date DESC
  `).all();

  res.json(patients);

});
app.post("/api/equipment/add", (req, res) => {
  const { name, location } = req.body;
  db.prepare("INSERT INTO equipment (name, location) VALUES (?, ?)").run(name, location);
  broadcastResources();
  res.json({ success: true });
});
app.post("/api/alert", (req, res) => {

  const { message, level } = req.body;

  db.prepare(`
    INSERT INTO alerts (message, level)
    VALUES (?, ?)
  `).run(message, level || "critical");

  // Broadcast alert to all clients
  broadcast({
    type: "EMERGENCY_ALERT",
    message,
    level
  });

  res.json({ success: true });

});

// Fallback to index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = 3000;
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});