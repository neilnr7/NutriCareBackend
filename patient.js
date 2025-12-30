// ===============================
// IMPORTS
// ===============================
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

// ✅ ADD THIS
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
exports.sendEmailOTP = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const otp = generateOTP();

    await db.collection("emailOTP").doc(email).set({
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your OTP Code for Verification",
      html: `<h2>Your OTP is ${otp}</h2>`,
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ======================================================================
// VERIFY EMAIL OTP
// ======================================================================
exports.verifyEmailOTP = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    const record = await db.collection("emailOTP").doc(email).get();
    if (!record.exists) return res.status(400).json({ error: "OTP not found" });

    const data = record.data();
    if (data.expiresAt < Date.now())
      return res.status(400).json({ error: "OTP expired" });

    if (data.otp !== otp)
      return res.status(400).json({ error: "Invalid OTP" });

    if (!validatePassword(newPassword))
      return res.status(400).json({ error: "Weak password" });

    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(user.uid, { password: newPassword });

    await db.collection("patients").doc(user.uid).update({
      password: await bcrypt.hash(newPassword, 10),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await db.collection("emailOTP").doc(email).delete();

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ======================================================================
// REGISTER PATIENT
// ======================================================================
exports.registerPatient = async (req, res) => {
  try {
    const { firstName, middleName, lastName, phone, email, gender, password } =
      req.body;

    const fullPhone = formatPhone(phone);
    if (!fullPhone) return res.status(400).json({ error: "Invalid phone" });

    const user = await admin.auth().createUser({
      email,
      phoneNumber: fullPhone,
      password,
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
      password: hashedPassword, // ✅ REQUIRED
      role: "patient",
      profileCompleted: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    res.json({ success: true, uid: user.uid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// ======================================================================
// LOGIN PATIENT
// ======================================================================
exports.loginPatient = async (req, res) => {
  try {
    const { phone, password } = req.body;
    const fullPhone = formatPhone(phone);

    const user = await admin.auth().getUserByPhoneNumber(fullPhone);
    const snap = await db.collection("patients").doc(user.uid).get();

    if (!(await bcrypt.compare(password, snap.data().password)))
      return res.status(400).json({ error: "Invalid password" });

    res.json({ success: true, uid: user.uid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ======================================================================
// UPDATE PATIENT PROFILE (ONLY ONE VERSION)
// ======================================================================
exports.updatePatientProfile = async (req, res) => {
  try {
    const { uid, dob, age, address } = req.body;

    await db.collection("patients").doc(uid).update({
      dob,
      age,
      address,
      profileCompleted: true,
      updatedAt: FieldValue.serverTimestamp(),
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ======================================================================
// GET PATIENT PROFILE
// ======================================================================
exports.getPatientProfile = async (req, res) => {
  try {
    const { uid } = req.query;
    const snap = await db.collection("patients").doc(uid).get();
    res.json({ success: true, data: snap.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
