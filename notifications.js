// ===============================
// NOTIFICATIONS (EMAIL)
// ===============================
require("dotenv").config();
const nodemailer = require("nodemailer");

// ---------------- EMAIL TRANSPORTER ----------------
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// =======================================================
// SEND APPOINTMENT EMAIL (Reusable)
// =======================================================
exports.sendAppointmentEmail = async ({
  to,
  subject,
  title,
  message,
  details = {},
}) => {
  const {
    doctorName,
    patientName,
    appointmentDate,
    startTime,
    endTime,
    status,
  } = details;

  const html = `
  <div style="font-family: Arial, sans-serif; padding: 25px; background: #f4f7fa;">
    <div style="max-width: 520px; margin: auto; background:#ffffff; border-radius:10px;
                padding: 25px; border: 1px solid #e6e6e6;">

      <h2 style="color:#2a2a2a; text-align:center; margin-bottom:10px;">
        ${title}
      </h2>

      <p style="font-size:16px; color:#4a4a4a; text-align:center;">
        ${message}
      </p>

      <div style="margin:25px auto; padding:20px; background:#f1f3f5; border-radius:8px;
                  border:1px solid #d0d7de; width: 90%;">

        ${doctorName ? `<p><strong>Doctor:</strong> ${doctorName}</p>` : ""}
        ${patientName ? `<p><strong>Patient:</strong> ${patientName}</p>` : ""}
        ${appointmentDate ? `<p><strong>Date:</strong> ${appointmentDate}</p>` : ""}
        ${startTime ? `<p><strong>Time:</strong> ${startTime} - ${endTime}</p>` : ""}
        ${status ? `<p><strong>Status:</strong> ${status}</p>` : ""}

      </div>

      <p style="font-size:14px; color:#555; text-align:center;">
        Please check your dashboard for more details.
      </p>

      <hr style="margin:25px 0; border:none; border-top:1px solid #ddd;" />

      <p style="font-size:13px; color:#888; text-align:center;">
        If you did not expect this email, you can safely ignore it.
      </p>

      <p style="font-size:14px; color:#4a4a4a; text-align:center; margin-top:20px;">
        Thank you,<br>
        <strong>Samagra Team</strong>
      </p>
    </div>
  </div>
  `;

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject,
    html,
  });
};

// =======================================================
// BACKWARD-COMPAT WRAPPER (DO NOT REMOVE)
// =======================================================
exports.sendEmail = async (to, subject, html) => {
  return exports.sendAppointmentEmail({
    to,
    subject,
    title: subject,
    message: html,
  });
};