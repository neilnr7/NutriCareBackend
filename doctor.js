// ===============================
// DOCTOR FUNCTIONS
// ===============================

require("dotenv").config();
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

// ---------------- FIREBASE INIT ----------------
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// ---------------- EMAIL TRANSPORTER ----------------
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
// SEND EMAIL OTP (Doctor)
// =======================================================
exports.sendDoctorEmailOTP = onRequest(async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) return res.status(400).json({ error: "Email is required" });

    const otp = generateOTP();

    // Store OTP with 5 min expiry
    await db.collection("doctorEmailOTP").doc(email).set({
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    });

    // Send OTP Email (same design as patient)
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your Doctor Verification OTP Code",
      html: `
  <div style="font-family: Arial, sans-serif; padding: 25px; background: #f4f7fa;">
    
    <div style="max-width: 500px; margin: auto; background:#ffffff; border-radius:10px;
                padding: 25px; border: 1px solid #e6e6e6;">

      <h2 style="color:#2a2a2a; text-align:center; margin-bottom:10px;">
        👨‍⚕️ Doctor Email Verification
      </h2>

      <p style="font-size:16px; color:#4a4a4a; text-align:center;">
        Use the One-Time Password (OTP) below to verify your doctor account.
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

    return res.json({ success: true, message: "Doctor OTP sent successfully" });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});


// =======================================================
// VERIFY EMAIL OTP + RESET PASSWORD (Doctor)
// =======================================================
exports.verifyDoctorEmailOTP = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp)
      return res.status(400).json({ error: "Email & OTP required" });

    const record = await admin.firestore().collection("doctorEmailOTP").doc(email).get();
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

    await admin.auth().updateUser(user.uid, { password: newPassword });

    const hashed = await bcrypt.hash(newPassword, 10);

    await admin.firestore().collection("doctors").doc(user.uid).update({
      password: hashed,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await admin.firestore().collection("doctorEmailOTP").doc(email).delete();

    return res.json({
      success: true,
      message: "Password reset successfully",
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// =======================================================
// REGISTER DOCTOR
// =======================================================
exports.registerDoctor = async (req, res) => {
  try {
    const {
      firstName,
      middleName,
      lastName,
      phone,
      email,
      gender,
      password,
      specialisation
    } = req.body;

    if (!firstName) return res.status(400).json({ error: "First name required" });
    if (!email) return res.status(400).json({ error: "Email is required" });
    if (!specialisation) return res.status(400).json({ error: "Specialisation required" });

    if (!gender || !["male", "female"].includes(gender.toLowerCase()))
      return res.status(400).json({ error: "Gender must be male or female" });

    const fullPhone = formatPhone(phone);
    if (!fullPhone)
      return res.status(400).json({ error: "Invalid phone number" });

    if (!validatePassword(password))
      return res.status(400).json({
        error: "Password must include uppercase, number & special character",
      });

    const emailExists = await admin.auth().getUserByEmail(email).catch(() => null);
    if (emailExists)
      return res.status(400).json({ error: "Email already registered" });

    const phoneExists = await admin.auth().getUserByPhoneNumber(fullPhone).catch(() => null);
    if (phoneExists)
      return res.status(400).json({ error: "Phone already registered" });

    const user = await admin.auth().createUser({
      email,
      phoneNumber: fullPhone,
      password,
      displayName: `${firstName} ${lastName || ""}`,
    });

    const hashedPassword = await bcrypt.hash(password, 10);

    await admin.firestore().collection("doctors").doc(user.uid).set({
      uid: user.uid,
      firstName,
      middleName: middleName || "",
      lastName: lastName || "",
      phone: fullPhone,
      email,
      gender,
      specialisation,
      password: hashedPassword,
      createdAt: FieldValue.serverTimestamp(),
      profileCompleted: false,
      role: "doctor",
    });

    return res.json({
      success: true,
      message: "Doctor registered successfully",
      uid: user.uid,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// =======================================================
// LOGIN DOCTOR
// =======================================================
exports.loginDoctor = async (req, res) => {
  try {
    const { phone, password } = req.body;

    const fullPhone = formatPhone(phone);
    if (!fullPhone)
      return res.status(400).json({ error: "Invalid phone number" });

    const user = await admin.auth().getUserByPhoneNumber(fullPhone).catch(() => null);
    if (!user)
      return res.status(404).json({ error: "Phone not registered" });

    const snap = await admin.firestore().collection("doctors").doc(user.uid).get();

    if (!snap.exists)
      return res.status(404).json({ error: "Doctor record missing" });

    const data = snap.data();

    const match = await bcrypt.compare(password, data.password);
    if (!match)
      return res.status(400).json({ error: "Invalid password" });

    const token = await admin.auth().createCustomToken(user.uid);

    return res.json({
      success: true,
      token,
      uid: user.uid,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// =======================================================
// UPDATE DOCTOR PROFILE
// =======================================================
exports.updateDoctorProfile = async (req, res) => {
  try {
    const { uid, dob, address, age, profilePicture, specialisation } = req.body;

    if (!uid) return res.status(400).json({ error: "UID required" });

    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dob))
      return res.status(400).json({ error: "DOB must be DD/MM/YYYY" });

    if (address.length > 100)
      return res.status(400).json({ error: "Address must be under 100 chars" });

    if (!Number.isInteger(age) || age < 1)
      return res.status(400).json({ error: "Age must be >= 1" });

    await admin.firestore().collection("doctors").doc(uid).update({
      dob,
      address,
      age,
      profilePicture: profilePicture || null,
      specialisation: specialisation || null,   // ✅ FIX
      profileCompleted: true,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return res.json({
      success: true,
      message: "Profile updated successfully",
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};



// =======================================================
// GET DOCTOR PROFILE
// =======================================================
exports.getDoctorProfile = onRequest(async (req, res) => {
  try {
    const { uid } = req.query;   // ✅ CORRECT

    if (!uid) {
      return res.status(400).json({ error: "UID required" });
    }

    const snap = await db.collection("doctors").doc(uid).get();
    if (!snap.exists) {
      return res.status(404).json({ error: "Doctor not found" });
    }

    return res.json({
      success: true,
      data: snap.data(),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

