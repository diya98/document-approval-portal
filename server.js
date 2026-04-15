const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const path = require("path");

const sgMail = require('@sendgrid/mail');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

let db = {};

// ---------------- SENDGRID INIT ----------------
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} else {
  console.error("❌ SENDGRID_API_KEY missing");
}

// ---------------- MULTER (ONLY PDF ALLOWED) ----------------
const upload = multer({
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files allowed"), false);
    }
  }
});

// ---------------- HOME ----------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---------------- UPLOAD ----------------
app.post('/upload', upload.single('file'), (req, res) => {
  try {
    const id = Date.now().toString();

    if (!req.file) {
      return res.status(400).send("No file uploaded or invalid file type");
    }

    db[id] = {
      file: req.file.path,
      subject: req.body.subject,
      approvers: [req.body.a1, req.body.a2, req.body.a3],
      step: 0,
      history: []
    };

    sendMail(id);

    res.send("File uploaded & sent for approval");
  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).send("Upload failed");
  }
});

// ---------------- SEND EMAIL ----------------
function sendMail(id) {
  const doc = db[id];

  if (!doc) return console.log("Invalid doc ID");

  const email = doc.approvers[doc.step];
  if (!email) return console.log("No approver email found");

  const link = `${process.env.URL}/approve/${id}`;

  const msg = {
    to: email,
    from: process.env.EMAIL,
    subject: doc.subject || "Approval Request",
    html: `
      <h3>Approval Required</h3>
      <p>Please review the document:</p>
      <a href="${link}">Open & Approve</a>
    `
  };

  sgMail.send(msg)
    .then(() => console.log("EMAIL SENT to:", email))
    .catch(error => console.log("EMAIL ERROR:", error.response?.body || error));
}

// ---------------- APPROVE ----------------
app.get('/approve/:id', async (req, res) => {
  try {
    const doc = db[req.params.id];

    if (!doc || !doc.file) {
      return res.status(404).send("Invalid request");
    }

    // ✅ FILE CHECK (FIX FOR PDF ERROR)
    if (!fs.existsSync(doc.file)) {
      return res.send("File not found on server");
    }

    const pdfBytes = fs.readFileSync(doc.file);

    // ✅ VALID PDF CHECK
    if (!pdfBytes || pdfBytes.length < 100) {
      return res.send("Invalid PDF file uploaded");
    }

    const pdfDoc = await PDFDocument.load(pdfBytes);
    const page = pdfDoc.getPages()[0];

    page.drawText(
      `Approved by: ${doc.approvers[doc.step]} | ${new Date().toDateString()}`,
      { x: 50, y: 50 - doc.history.length * 20, size: 10 }
    );

    const updated = await pdfDoc.save();
    fs.writeFileSync(doc.file, updated);

    doc.history.push(doc.approvers[doc.step]);
    doc.step++;

    if (doc.step < 3) {
      sendMail(req.params.id);
      res.send("Approved & moved to next approver");
    } else {
      res.send("Final Approval Completed 🎉");
    }

  } catch (err) {
    console.error("APPROVAL ERROR:", err);
    res.status(500).send("Approval failed");
  }
});

// ---------------- SERVER ----------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
