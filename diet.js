// ===============================
// DIET FUNCTIONS (Doctor ↔ Patient)
// ===============================

const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { verifyAnyRole, verifyRole } = require("./auth");

// ---------------- FIREBASE INIT ----------------
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// ---------------- CONSTANTS ----------------
const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const SLOTS = [
  "6–9 AM",
  "9–12 PM",
  "12–3 PM",
  "3–6 PM",
  "6–9 PM",
  "9–12 AM",
];

// =======================================================
// 0️⃣ GET DOCTOR PATIENTS (FROM CHATS)
// =======================================================
exports.getDoctorDietPatients = async (req, res) => {
  try {
    const { uid } = await verifyAnyRole(req, ["doctor"]);

    const snap = await db
      .collection("chats")
      .where("doctorId", "==", uid)
      .orderBy("updatedAt", "desc")
      .get();

    const seen = new Set();
    const patients = [];

    snap.docs.forEach(doc => {
      const data = doc.data();
      if (!seen.has(data.patientId)) {
        seen.add(data.patientId);
        patients.push({
          patientId: data.patientId,
          patientName: data.patientName,
        });
      }
    });

    return res.json({ success: true, patients });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// =======================================================
// 1️⃣ SAVE / UPDATE DIET PLAN (DOCTOR ONLY)
// =======================================================
exports.saveDietPlan = async (req, res) => {
  try {
    const doctorUid = await verifyRole(req, "doctor");
    const { patientId, weeklyDiet } = req.body;

    if (!patientId || !weeklyDiet) {
      return res.status(400).json({ error: "patientId & weeklyDiet required" });
    }

    const patientSnap = await db.collection("patients").doc(patientId).get();
    if (!patientSnap.exists) {
      return res.status(404).json({ error: "Patient not found" });
    }

    // 🔍 Validate structure
    for (const day of DAYS) {
      if (!weeklyDiet[day]) {
        return res.status(400).json({ error: `Missing day: ${day}` });
      }

      for (const slot of SLOTS) {
        if (
          weeklyDiet[day][slot] !== undefined &&
          typeof weeklyDiet[day][slot] !== "string"
        ) {
          return res
            .status(400)
            .json({ error: `Invalid value for ${day} ${slot}` });
        }
      }
    }

    // ✅ Initialize weeklyStatus (if not present)
    const weeklyStatus = {};
    for (const day of DAYS) {
      weeklyStatus[day] = {};
      for (const slot of SLOTS) {
        weeklyStatus[day][slot] = false;
      }
    }

    await db.collection("diets").doc(patientId).set(
      {
        patientId,
        doctorId: doctorUid,
        weeklyDiet,
        weeklyStatus,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.json({
      success: true,
      message: "Diet plan saved successfully",
    });
  } catch (err) {
    return res.status(403).json({ error: err.message });
  }
};

// =======================================================
// 2️⃣ GET DIET (DOCTOR VIEW)
// =======================================================
exports.getDietForDoctor = async (req, res) => {
  try {
    const doctorUid = await verifyRole(req, "doctor");
    const { patientId } = req.query;

    if (!patientId) {
      return res.status(400).json({ error: "patientId required" });
    }

    const dietSnap = await db.collection("diets").doc(patientId).get();
    if (!dietSnap.exists) {
      return res.json({ success: true, diet: null });
    }

    const diet = dietSnap.data();
    if (diet.doctorId !== doctorUid) {
      return res.status(403).json({ error: "Not your patient diet" });
    }

    return res.json({
      success: true,
      diet: diet.weeklyDiet,
      status: diet.weeklyStatus || {},
    });
  } catch (err) {
    return res.status(403).json({ error: err.message });
  }
};

// =======================================================
// 3️⃣ GET DIET (PATIENT VIEW)
// =======================================================
exports.getDietForPatient = async (req, res) => {
  try {
    const patientUid = await verifyRole(req, "patient");
    const dietSnap = await db.collection("diets").doc(patientUid).get();

    if (!dietSnap.exists) {
      return res.json({ success: true, diet: null });
    }

    const data = dietSnap.data();

    return res.json({
      success: true,
      diet: data.weeklyDiet,
      status: data.weeklyStatus || {},
    });
  } catch (err) {
    return res.status(403).json({ error: err.message });
  }
};

// =======================================================
// 4️⃣ UPDATE DIET STATUS (PATIENT ONLY) 🆕
// =======================================================
exports.updateDietStatus = async (req, res) => {
  try {
    const patientUid = await verifyRole(req, "patient");
    const { day, slot, completed } = req.body;

    if (!day || !slot || typeof completed !== "boolean") {
      return res.status(400).json({ error: "day, slot, completed required" });
    }

    if (!DAYS.includes(day) || !SLOTS.includes(slot)) {
      return res.status(400).json({ error: "Invalid day or slot" });
    }

    await db.collection("diets").doc(patientUid).set(
      {
        weeklyStatus: {
          [day]: {
            [slot]: completed,
          },
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.json({
      success: true,
      message: "Diet status updated",
    });
  } catch (err) {
    return res.status(403).json({ error: err.message });
  }
};

// =======================================================
// 5️⃣ GET DOCTOR PATIENTS (FROM APPOINTMENTS)
// =======================================================
exports.getDoctorPatientsFromAppointments = async (req, res) => {
  try {
    const doctorUid = await verifyRole(req, "doctor");

    const snap = await db
      .collection("appointments")
      .where("doctorId", "==", doctorUid)
      .orderBy("appointmentDate", "desc")
      .get();

    const seen = new Set();
    const patients = [];

    snap.docs.forEach(doc => {
      const data = doc.data();
      if (!seen.has(data.patientId)) {
        seen.add(data.patientId);
        patients.push({
          patientId: data.patientId,
          patientName: data.patientName || "Patient",
        });
      }
    });

    return res.json({ success: true, patients });
  } catch (err) {
    return res.status(403).json({ error: err.message });
  }
};

// =======================================================
// 6️⃣ GET DIET STATUS (Doctor / Patient) 🆕
// =======================================================
exports.getDietStatus = async (req, res) => {
  try {
    const { uid, role } = await verifyAnyRole(req, ["doctor", "patient"]);

    let patientId;

    if (role === "patient") {
      patientId = uid;
    } else {
      patientId = req.query.patientId;
      if (!patientId) {
        return res.status(400).json({ error: "patientId required" });
      }
    }

    const dietSnap = await db.collection("diets").doc(patientId).get();

    if (!dietSnap.exists) {
      return res.json({ success: true, weeklyStatus: {} });
    }

    return res.json({
      success: true,
      weeklyStatus: dietSnap.data().weeklyStatus || {},
    });
  } catch (err) {
    return res.status(403).json({ error: err.message });
  }
};
