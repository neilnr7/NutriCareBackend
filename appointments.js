// ===============================
// APPOINTMENTS FUNCTIONS
// ===============================

require("dotenv").config();
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { verifyRole } = require("./auth");
const { sendAppointmentEmail } = require("./notifications"); 

// ---------------- FIREBASE INIT ----------------
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// ---------------- HELPERS ----------------
function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function isValidTime(time) {
  return /^\d{2}:\d{2}$/.test(time);
}

/**
 * Check slot availability (appointments + blocked slots)
 */
async function isSlotAvailable(doctorId, date, startTime, endTime) {
  const snap = await db
    .collection("appointments")
    .where("doctorId", "==", doctorId)
    .where("appointmentDate", "==", date)
    .where("status", "in", ["requested", "approved", "blocked"])
    .get();

  return !snap.docs.some(doc => {
    const a = doc.data();
    return !(endTime <= a.startTime || startTime >= a.endTime);
  });
}

exports.createAppointment = async (req, res) => {
  try {
    const patientUid = await verifyRole(req, "patient");

    const {
      doctorId,
      appointmentDate,
      startTime,
      endTime,
      reason,
      isRecurring = false,
      recurrenceType = "none",
    } = req.body;

    if (!doctorId) return res.status(400).json({ error: "Doctor ID required" });
    if (!isValidDate(appointmentDate))
      return res.status(400).json({ error: "Invalid date" });
    if (!isValidTime(startTime) || !isValidTime(endTime))
      return res.status(400).json({ error: "Invalid time" });

    const available = await isSlotAvailable(
      doctorId,
      appointmentDate,
      startTime,
      endTime
    );

    if (!available)
      return res.status(400).json({ error: "Time slot not available" });

    // 🔍 FETCH DOCTOR NAME
    let doctorName = "Doctor";
    const doctorSnap = await db.collection("doctors").doc(doctorId).get();
    if (doctorSnap.exists) {
      const d = doctorSnap.data();
      doctorName = `${d.firstName || ""} ${d.lastName || ""}`.trim();
    }

    // 🔍 FETCH PATIENT NAME
    let patientName = "Patient";
    const patientSnap = await db.collection("patients").doc(patientUid).get();
    if (patientSnap.exists) {
      const p = patientSnap.data();
      patientName = `${p.firstName || ""} ${p.lastName || ""}`.trim();
    }

    const ref = db.collection("appointments").doc();

    await ref.set({
      appointmentId: ref.id,
      patientId: patientUid,
      patientName,           // ✅ NOW DEFINED
      doctorId,
      doctorName,            // ✅ NOW DEFINED
      appointmentDate,
      startTime,
      endTime,
      status: "requested",
      reason: reason || "",
      isRecurring,
      recurrenceType,
      parentAppointmentId: null,
      rescheduledFrom: null,
      rescheduledTo: null,
      report: null,
      createdBy: "patient",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await sendAppointmentEmail({
      to: "doctor@email.com",
      subject: "New Appointment Request",
      title: "New Appointment",
      message: "You have a new appointment request.",
      details: {
        appointmentDate,
        startTime,
        endTime,
        status: "requested",
      },
    });

    res.json({
      success: true,
      message: "Appointment requested",
      appointmentId: ref.id,
    });
  } catch (err) {
    console.error(err);
    res.status(403).json({ error: err.message });
  }
};


// =======================================================
// 2️⃣ GET DOCTOR UPCOMING APPOINTMENTS BY DATE
// =======================================================
exports.getDoctorAppointmentsByDate = async (req, res) => {
  try {
    const doctorUid = await verifyRole(req, "doctor");
    const date = req.query.date;

    if (!date)
      return res.status(400).json({ error: "Invalid date" });

    const snap = await db
      .collection("appointments")
      .where("doctorId", "==", doctorUid)
      .where("appointmentDate", "==", date)
      .where("status", "in", ["requested", "approved"])
      .orderBy("startTime")
      .get();

    const appointments = await Promise.all(
      snap.docs.map(async (doc) => {
        const data = doc.data();

        let patientName = "Patient";
        try {
          const patientSnap = await db
            .collection("patients")
            .doc(data.patientId)
            .get();

          if (patientSnap.exists) {
            const p = patientSnap.data();
            patientName = `${p.firstName || ""} ${p.lastName || ""}`.trim();
          }
        } catch (_) {}

        return {
          ...data,
          patientName,
        };
      })
    );

    res.json({
      success: true,
      appointments,
    });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
};


// =======================================================
// 3️⃣ UPDATE APPOINTMENT STATUS (DOCTOR)
// =======================================================
exports.updateAppointmentStatus = async (req, res) => {
  try {
    const doctorUid = await verifyRole(req, "doctor");
    const { appointmentId, status } = req.body;

    const allowed = ["approved", "completed", "cancelled"];
    if (!allowed.includes(status))
      return res.status(400).json({ error: "Invalid status" });

    const ref = db.collection("appointments").doc(appointmentId);
    const snap = await ref.get();

    if (!snap.exists)
      return res.status(404).json({ error: "Appointment not found" });

    if (snap.data().doctorId !== doctorUid)
      return res.status(403).json({ error: "Not your appointment" });

    await ref.update({
      status,
      updatedAt: FieldValue.serverTimestamp(),
    });

    res.json({ success: true, message: "Status updated" });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
};

// =======================================================
// 4️⃣ ADD REPORT (DOCTOR)
// =======================================================
exports.addAppointmentReport = async (req, res) => {
  try {
    await verifyRole(req, "doctor");

    const { appointmentId, report } = req.body;
    if (!report)
      return res.status(400).json({ error: "Report required" });

    await db.collection("appointments").doc(appointmentId).update({
      report,
      status: "completed",
      updatedAt: FieldValue.serverTimestamp(),
    });

    res.json({ success: true, message: "Report added" });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
};

// =======================================================
// 5️⃣ RESCHEDULE APPOINTMENT (DOCTOR)
// =======================================================
exports.rescheduleAppointment = async (req, res) => {
  try {
    const doctorUid = await verifyRole(req, "doctor");
    const { appointmentId, newDate, newStartTime, newEndTime } = req.body;

    if (!isValidDate(newDate) || !isValidTime(newStartTime))
      return res.status(400).json({ error: "Invalid date/time" });

    const oldRef = db.collection("appointments").doc(appointmentId);
    const oldSnap = await oldRef.get();

    if (!oldSnap.exists)
      return res.status(404).json({ error: "Appointment not found" });

    const oldData = oldSnap.data();

    if (oldData.doctorId !== doctorUid)
      return res.status(403).json({ error: "Not your appointment" });

    const available = await isSlotAvailable(
      doctorUid,
      newDate,
      newStartTime,
      newEndTime
    );

    if (!available)
      return res.status(400).json({ error: "Slot not available" });

    const newRef = db.collection("appointments").doc();

    await newRef.set({
      ...oldData,
      appointmentId: newRef.id,
      appointmentDate: newDate,
      startTime: newStartTime,
      endTime: newEndTime,
      status: "requested",
      parentAppointmentId: appointmentId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await oldRef.update({
      status: "rescheduled",
      rescheduledTo: newRef.id,
      updatedAt: FieldValue.serverTimestamp(),
    });

    res.json({
      success: true,
      message: "Appointment rescheduled",
      newAppointmentId: newRef.id,
    });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
};

// =======================================================
// 6️⃣ WEEKLY RECURRENCE
// =======================================================
exports.generateWeeklyAppointment = async (req, res) => {
  try {
    await verifyRole(req, "doctor");
    const { appointmentId } = req.body;

    const snap = await db.collection("appointments").doc(appointmentId).get();
    if (!snap.exists)
      return res.status(404).json({ error: "Appointment not found" });

    const data = snap.data();
    if (!data.isRecurring || data.recurrenceType !== "weekly")
      return res.status(400).json({ error: "Not weekly recurring" });

    const next = new Date(data.appointmentDate);
    next.setDate(next.getDate() + 7);

    const ref = db.collection("appointments").doc();

    await ref.set({
      ...data,
      appointmentId: ref.id,
      appointmentDate: next.toISOString().split("T")[0],
      parentAppointmentId: appointmentId,
      status: "requested",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    res.json({ success: true, appointmentId: ref.id });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
};

// =======================================================
// 7️⃣ BLOCK DOCTOR CALENDAR
// =======================================================
exports.blockDoctorCalendar = async (req, res) => {
  try {
    const doctorUid = await verifyRole(req, "doctor");
    const { date, startTime, endTime, reason } = req.body;

    await db.collection("appointments").add({
      doctorId: doctorUid,
      appointmentDate: date,
      startTime,
      endTime,
      status: "blocked",
      reason: reason || "Doctor unavailable",
      createdBy: "doctor",
      createdAt: FieldValue.serverTimestamp(),
    });

    res.json({ success: true, message: "Calendar blocked" });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
};

exports.getPatientAppointments = async (req, res) => {
  try {
    const patientUid = await verifyRole(req, "patient");

    const snap = await db
      .collection("appointments")
      .where("patientId", "==", patientUid)
      .where("status", "in", ["requested", "approved"])
      .orderBy("appointmentDate")
      .get();

    const appointments = await Promise.all(
      snap.docs.map(async (doc) => {
        const data = doc.data();

        let doctorName = "Doctor";
        try {
          const doctorSnap = await db
            .collection("doctors")
            .doc(data.doctorId)
            .get();

          if (doctorSnap.exists) {
            const d = doctorSnap.data();
            doctorName = `${d.firstName || ""} ${d.lastName || ""}`.trim();
          }
        } catch (e) {}

        return {
          ...data,
          doctorName,
        };
      })
    );

    res.json({
      success: true,
      appointments,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};


// =======================================================
// 8️⃣ GET DOCTOR APPOINTMENTS BY STATUS (COMPLETED / CANCELLED)
// =======================================================
// =======================================================
// 🔹 GET DOCTOR APPOINTMENTS BY STATUS (COMPLETED / CANCELLED)
// =======================================================
exports.getDoctorAppointmentsByStatus = async (req, res) => {
  try {
    const doctorUid = await verifyRole(req, "doctor");
    const { status } = req.query;

    const allowed = ["completed", "cancelled"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const snap = await db
      .collection("appointments")
      .where("doctorId", "==", doctorUid)
      .where("status", "==", status)
      .orderBy("appointmentDate", "desc")
      .get();

    const appointments = snap.docs.map(doc => doc.data());

    res.json({
      success: true,
      appointments,
    });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
};
