const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");

const sesClient = new SESv2Client({});
const MAX_BODY_BYTES = 8192;
const MAX_MESSAGE_LENGTH = 5000;

function allowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function response(statusCode, body, origin) {
  const headers = {
    "Content-Type": "application/json",
    "Vary": "Origin"
  };

  if (origin && allowedOrigins().includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return {
    statusCode,
    headers,
    body: body === null ? "" : JSON.stringify(body)
  };
}

function parseBody(event) {
  if (typeof event.body !== "string") {
    throw new Error("Request body must be JSON.");
  }

  const bodyText = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;

  if (Buffer.byteLength(bodyText, "utf8") > MAX_BODY_BYTES) {
    throw new Error("Request body is too large.");
  }

  const body = JSON.parse(bodyText);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be a JSON object.");
  }

  return body;
}

function validate(body) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!name || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)) {
    return { error: "Enter a name of 1 to 100 characters." };
  }

  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return { error: "Enter a valid email address." };
  }

  if (phone.length > 40 || (phone && !/^[+0-9().\-\s]+$/.test(phone))) {
    return { error: "Enter a valid phone number or leave it blank." };
  }

  if (
    !message ||
    message.length > MAX_MESSAGE_LENGTH ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(message)
  ) {
    return { error: "Enter a message of 1 to 5000 characters." };
  }

  return { name, email, phone, message };
}

function sendEmail(input) {
  return sesClient.send(new SendEmailCommand(input));
}

exports.handler = async (event) => {
  const headers = event.headers || {};
  const origin = headers.origin || headers.Origin;
  const method = event.httpMethod || event.requestContext?.http?.method;
  const isAllowedOrigin = !origin || allowedOrigins().includes(origin);

  if (!isAllowedOrigin) {
    return response(403, { error: "This website is not allowed to submit the form." });
  }

  if (method === "OPTIONS") {
    const result = response(204, null, origin);
    result.headers["Access-Control-Allow-Methods"] = "POST,OPTIONS";
    result.headers["Access-Control-Allow-Headers"] = "Content-Type";
    result.headers["Access-Control-Max-Age"] = "600";
    return result;
  }

  if (method !== "POST") {
    return response(405, { error: "Method not allowed." }, origin);
  }

  let body;
  try {
    body = parseBody(event);
  } catch (error) {
    return response(400, { error: error.message }, origin);
  }

  const submission = validate(body);
  if (submission.error) {
    return response(400, { error: submission.error }, origin);
  }

  const sender = process.env.CONTACT_SENDER_EMAIL;
  const recipient = process.env.CONTACT_RECIPIENT_EMAIL;
  if (!sender || !recipient) {
    console.error("Contact email configuration is missing.");
    return response(500, { error: "The contact form is temporarily unavailable." }, origin);
  }

  const { name, email, phone, message } = submission;
  const ownerMessage = [
    `Name: ${name}`,
    `Email: ${email}`,
    `Phone: ${phone || "Not provided"}`,
    "",
    "Message:",
    message
  ].join("\n");

  const emailContent = (subject, text) => ({
    Simple: {
      Subject: { Data: subject, Charset: "UTF-8" },
      Body: { Text: { Data: text, Charset: "UTF-8" } }
    }
  });

  try {
    await Promise.all([
      sendEmail({
        FromEmailAddress: sender,
        Destination: { ToAddresses: [recipient] },
        ReplyToAddresses: [email],
        Content: emailContent(`New contact message from ${name}`, ownerMessage)
      }),
      sendEmail({
        FromEmailAddress: sender,
        Destination: { ToAddresses: [email] },
        Content: emailContent(
          "Thanks for getting in touch",
          `Hello ${name},\n\nThanks for reaching out. Your message has been received, and I will get back to you as soon as I can.\n\nBest,\nAye`
        )
      })
    ]);
  } catch (error) {
    const diagnosticMessage = typeof error.message === "string"
      ? error.message
        .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[redacted email]")
        .slice(0, 500)
      : "No diagnostic message provided.";

    console.error("Contact email delivery failed.", {
      name: error.name || "UnknownError",
      statusCode: error.$metadata?.httpStatusCode,
      message: diagnosticMessage
    });
    return response(502, { error: "We could not send your message. Please try again later." }, origin);
  }

  return response(202, { message: "Message accepted." }, origin);
};