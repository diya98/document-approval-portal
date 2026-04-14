const express = require('express');
const multer = require('multer');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { PDFDocument } = require('pdf-lib');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

let db = {};

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASS
  }
});

app.post('/upload', upload.single('file'), (req, res) => {
  const id = Date.now();

  db[id] = {
    file: req.file.path,
    subject: req.body.subject,
    approvers: [req.body.a1, req.body.a2, req.body.a3],
    step: 0,
    history: []
  };

  sendMail(id);
  res.send("File uploaded & sent for approval");
});

function sendMail(id) {
  const doc = db[id];
  const email = doc.approvers[doc.step];

  const link = `${process.env.URL}/approve/${id}`;

  transporter.sendMail({
    to: email,
    subject: doc.subject,
    html: `<a href="${link}">Open & Approve</a>`
  });
}

app.get('/approve/:id', async (req, res) => {
  const doc = db[req.params.id];

  const pdfBytes = fs.readFileSync(doc.file);
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
    res.send("Approved & moved forward");
  } else {
    res.send("Final Approval Done");
  }
});

app.listen(3000);
