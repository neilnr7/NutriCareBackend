// ===============================
// IMPORTS
// ===============================
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { onRequest } = require("firebase-functions/v2/https");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

// ===============================
// FIREBASE INIT
// ===============================
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// ===============================
// NODEMAILER TRANSPORTER
// ===============================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ---------------- HELPERS ----------------
function validatePassword(password) {
  const rules = [/[A-Z]/, /\d/, /[!@#$%^&*]/];
  return password.length >= 8 && rules.every((r) => r.test(password));
}

function formatPhone(phone) {
  if (!/^[6-9]\d{9}$/.test(phone)) return null;
  return "+91" + phone;
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// =======================================================
// SEND EMAIL OTP
// =======================================================
exports.sendEmailOTP = onRequest(async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) return res.status(400).json({ error: "Email is required" });

    const otp = generateOTP();

    // Store OTP with 5 min expiry
    await db.collection("emailOTP").doc(email).set({
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 min
    });

    // Send OTP Email with HTML Content
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your OTP Code for Verification",
      html: `
  <div style="font-family: Arial, sans-serif; padding: 25px; background: #f4f7fa;">
   
    <div style="max-width: 500px; margin: auto; background:#ffffff; border-radius:10px;
                padding: 25px; border: 1px solid #e6e6e6;">

      <h2 style="color:#2a2a2a; text-align:center; margin-bottom:10px;">
        🔐 Email Verification
      </h2>

      <p style="font-size:16px; color:#4a4a4a; text-align:center;">
        Use the One-Time Password (OTP) below to reset your password.
      </p>

      <div style="margin:25px auto; padding:20px; background:#f1f3f5; border-radius:8px;
                  border:1px solid #d0d7de; text-align:center; width: 80%;">
        <h1 style="letter-spacing:6px; color:#000; margin:0; font-size:25px;">
          ${otp}
        </h1>
      </div>

      <p style="font-size:14px; color:#555; text-align:center;">
        This OTP is valid for <strong>5 minutes</strong>.<br />
        Please do not share it with anyone.
      </p>

      <hr style="margin:25px 0; border:none; border-top:1px solid #ddd;" />

      <p style="font-size:13px; color:#888; text-align:center;">
        If you did not request this code, you can safely ignore this email.
      </p>

      <p style="font-size:14px; color:#4a4a4a; text-align:center; margin-top:20px;">
        Thank you,<br>
        <strong>Samagra Team</strong>
      </p>

    </div>

  </div>
`,

    });

    return res.json({ success: true, message: "OTP sent to email successfully" });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ======================================================================
// 2️⃣ VERIFY EMAIL OTP + RESET PASSWORD
// ======================================================================
exports.verifyEmailOTP = onRequest(async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp)
      return res.status(400).json({ error: "Email & OTP required" });

    const record = await db.collection("emailOTP").doc(email).get();
    if (!record.exists) return res.status(400).json({ error: "OTP not found" });

    const data = record.data();

    if (data.expiresAt < Date.now())
      return res.status(400).json({ error: "OTP expired" });

    if (data.otp !== otp)
      return res.status(400).json({ error: "Invalid OTP" });

    if (!validatePassword(newPassword))
      return res.status(400).json({
        error: "Password must include uppercase, number & special character",
      });

    const user = await admin.auth().getUserByEmail(email).catch(() => null);
    if (!user) return res.status(404).json({ error: "Email not registered" });

    // Firebase Auth update
    await admin.auth().updateUser(user.uid, { password: newPassword });

    // Firestore update
    const hashed = await bcrypt.hash(newPassword, 10);
    await db.collection("patients").doc(user.uid).update({
      password: hashed,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await db.collection("emailOTP").doc(email).delete();

    res.json({ success: true, message: "Password reset successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================================================================
// REGISTER PATIENT
// ======================================================================
exports.registerPatient = onRequest(async (req, res) => {
  try {
    const {
      firstName,
      middleName,
      lastName,
      phone,
      email,
      gender,
      password,
    } = req.body;

    if (!firstName)
      return res.status(400).json({ error: "First name required" });
    if (!email)
      return res.status(400).json({ error: "Email is required" });

    if (!gender || !["male", "female"].includes(gender.toLowerCase()))
      return res.status(400).json({ error: "Gender must be male/female" });

    const fullPhone = formatPhone(phone);
    if (!fullPhone)
      return res.status(400).json({ error: "Invalid phone number" });

    if (!validatePassword(password))
      return res.status(400).json({
        error: "Password must include uppercase, number & special character",
      });

    if (await admin.auth().getUserByEmail(email).catch(() => null))
      return res.status(400).json({ error: "Email already registered" });

    if (await admin.auth().getUserByPhoneNumber(fullPhone).catch(() => null))
      return res.status(400).json({ error: "Phone already registered" });

    const user = await admin.auth().createUser({
      email,
      phoneNumber: fullPhone,
      password,
      displayName: `${firstName} ${lastName || ""}`,
    });

    // ✅ ADD ROLE TO FIREBASE AUTH (IMPORTANT)
    await admin.auth().setCustomUserClaims(user.uid, {
      role: "patient",
    });

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.collection("patients").doc(user.uid).set({
      uid: user.uid,
      firstName,
      middleName: middleName || "",
      lastName: lastName || "",
      phone: fullPhone,
      email,
      gender,
      password: hashedPassword,
      createdAt: FieldValue.serverTimestamp(),
      profileCompleted: false,
      role: "patient",
    });

    res.json({
      success: true,
      message: "Patient registered successfully",
      uid: user.uid,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ======================================================================
// 4️⃣ LOGIN PATIENT (FIXED)
// ======================================================================
exports.loginPatient = onRequest(async (req, res) => {
  try {
    const { phone, password } = req.body;

    const fullPhone = formatPhone(phone);
    if (!fullPhone)
      return res.status(400).json({ error: "Invalid phone number" });

    const user = await admin
      .auth()
      .getUserByPhoneNumber(fullPhone)
      .catch(() => null);

    if (!user) return res.status(404).json({ error: "Phone not registered" });

    const snap = await db.collection("patients").doc(user.uid).get();
    if (!snap.exists)
      return res.status(404).json({ error: "Patient record missing" });

    const data = snap.data();

    if (!(await bcrypt.compare(password, data.password)))
      return res.status(400).json({ error: "Invalid password" });

    // ✅ CREATE CUSTOM TOKEN
    const customToken = await admin.auth().createCustomToken(user.uid);

    res.json({
      success: true,
      uid: user.uid,
      token: customToken, // ✅ THIS MUST BE CUSTOM TOKEN
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ======================================================================
// GET PATIENT PROFILE
// ======================================================================
/* ================= GET PATIENT PROFILE ================= */
exports.getPatientProfile = async (req, res) => {
  try {
    const { uid } = req.query;

    if (!uid) {
      return res.status(400).json({ error: "UID required" });
    }

    const snap = await db.collection("patients").doc(uid).get();

    if (!snap.exists) {
      return res.status(404).json({ error: "Patient not found" });
    }

    res.json({ success: true, data: snap.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



// ======================================================================
// 5️⃣ UPDATE PATIENT PROFILE
// ======================================================================
exports.updatePatientProfile = onRequest(async (req, res) => {
  try {
    const { uid, dob, address, healthRecords, profilePicture, age } = req.body;

    if (!uid) return res.status(400).json({ error: "UID required" });

    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dob))
      return res.status(400).json({ error: "DOB must be DD/MM/YYYY" });

    const [DD, MM, YYYY] = dob.split("/").map(Number);
    if (DD < 1 || DD > 31) return res.status(400).json({ error: "Invalid day" });
    if (MM < 1 || MM > 12) return res.status(400).json({ error: "Invalid month" });
    if (String(YYYY).length !== 4)
      return res.status(400).json({ error: "Year must be 4 digits" });

    if (address.length > 100)
      return res.status(400).json({ error: "Address must be < 100 chars" });

    if (!Number.isInteger(age) || age < 1)
      return res.status(400).json({ error: "Invalid age" });

    function isImageURL(url) {
      return (
        typeof url === "string" &&
        (/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(url) ||
          url.includes("unsplash.com") ||
          url.includes("googleusercontent.com"))
      );
    }

    if (healthRecords) {
      if (!Array.isArray(healthRecords))
        return res.status(400).json({ error: "Health records must be array" });

      for (let img of healthRecords)
        if (!isImageURL(img))
          return res.status(400).json({ error: "Invalid image URL in records" });
    }

    if (profilePicture && !isImageURL(profilePicture))
      return res
        .status(400)
        .json({ error: "Invalid profile picture URL" });

    await db.collection("patients").doc(uid).update({
      dob,
      address,
      age,
      profilePicture: profilePicture || null,
      healthRecords: healthRecords || [],
      profileCompleted: true,
      updatedAt: FieldValue.serverTimestamp(),
    });

    res.json({ success: true, message: "Profile updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================================================
// 6️⃣ GET MY APPOINTMENTS (PATIENT)
// =======================================================
exports.getMyAppointments = onRequest(async (req, res) => {
  try {
    const { uid, type = "all" } = req.query;

    if (!uid) {
      return res.status(400).json({ error: "Patient UID required" });
    }

    let query = db
      .collection("appointments")
      .where("patientId", "==", uid);

    // Filter by type
    if (type === "upcoming") {
      query = query.where("status", "in", ["requested", "approved"]);
    }

    if (type === "history") {
      query = query.where("status", "in", ["completed", "cancelled"]);
    }

    if (type === "rescheduled") {
      query = query.where("status", "==", "rescheduled");
    }

    const snap = await query.orderBy("appointmentDate", "desc").get();

    const appointments = snap.docs.map(doc => ({
      ...doc.data(),
      id: doc.id,
    }));

    return res.json({
      success: true,
      count: appointments.length,
      appointments,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// =======================================================
// 7️⃣ VIEW RESCHEDULE DETAILS (PATIENT)
// =======================================================
exports.getRescheduledAppointment = onRequest(async (req, res) => {
  try {
    const { appointmentId } = req.query;

    if (!appointmentId) {
      return res.status(400).json({ error: "Appointment ID required" });
    }

    const snap = await db.collection("appointments").doc(appointmentId).get();

    if (!snap.exists) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    const data = snap.data();

    // If doctor rescheduled, fetch the new appointment
    let newAppointment = null;
    if (data.rescheduledTo) {
      const newSnap = await db
        .collection("appointments")
        .doc(data.rescheduledTo)
        .get();

      if (newSnap.exists) {
        newAppointment = newSnap.data();
      }
    }

    return res.json({
      success: true,
      originalAppointment: data,
      rescheduledAppointment: newAppointment,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// =======================================================
// 8️⃣ PATIENT APPOINTMENT HISTORY (COMPLETED + CANCELLED)
// =======================================================
exports.getAppointmentHistory = onRequest(async (req, res) => {
  try {
    const { uid } = req.query;

    if (!uid) {
      return res.status(400).json({ error: "Patient UID required" });
    }

    const snap = await db
      .collection("appointments")
      .where("patientId", "==", uid)
      .where("status", "in", ["completed", "cancelled"])
      .orderBy("appointmentDate", "desc")
      .get();

    const history = snap.docs.map(doc => doc.data());

    return res.json({
      success: true,
      count: history.length,
      history,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
