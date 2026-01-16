// src/controllers/issuer.controller.js

import Issuer from "../models/issuer.model.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";
import axios from "axios";

/* ------------------------------------------------------------------
   Helper Normalizers
------------------------------------------------------------------ */

function normalizeAdmin(admin = {}) {
  return {
    firstName: admin.firstName || "",
    lastName: admin.lastName || "",
    email: admin.email || "",
    orgDept: admin.orgDept || "",
  };
}

function normalizePrimaryContact(pc = {}) {
  return {
    firstName: pc.firstName || "",
    lastName: pc.lastName || "",
    email: pc.email || "",
    phone: pc.phone || "",
  };
}

function normalizeIssuerDoc(doc) {
  if (!doc) return null;

  const obj = doc.toObject ? doc.toObject() : { ...doc };

  return {
    issuerId: obj.issuerId,

    orgName: obj.orgName || "",
    postal: obj.postal || "",
    website: obj.website || "",
    orgEmail: obj.orgEmail || "",

    primaryContact: normalizePrimaryContact(obj.primaryContact),
    supportEmail: obj.supportEmail || "",

    admin1: normalizeAdmin(obj.admin1),
    admin2: normalizeAdmin(obj.admin2),
    admin3: normalizeAdmin(obj.admin3),

    // ✅ AUDIT INFO (read-only for frontend)
    addedByAdmin: obj.addedByAdmin,
    lastUpdatedBy: obj.lastUpdatedBy,

    isDeleted: !!obj.isDeleted,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

function normalizeIssuerPayload(body) {
  return {
    orgName: body.orgName,
    postal: body.postal,
    website: body.website,
    orgEmail: body.orgEmail,

    primaryContact: normalizePrimaryContact(body.primaryContact),
    supportEmail: body.supportEmail,

    admin1: normalizeAdmin(body.admin1),
    admin2: normalizeAdmin(body.admin2),
    admin3: normalizeAdmin(body.admin3),
  };
}

/* ------------------------------------------------------------------
   CREATE ISSUER
------------------------------------------------------------------ */

async function sendWelcomeIssuerEmailsIndividually({ issuer, adminEmail }) {
  console.log("📧 Preparing individual welcome emails for issuer onboarding");

  const recipients = [
    {
      role: "PRIMARY_CONTACT",
      email: issuer.primaryContact?.email,
      name: `${issuer.primaryContact?.firstName || ""} ${
        issuer.primaryContact?.lastName || ""
      }`,
    },
    {
      role: "ADMIN1",
      email: issuer.admin1?.email,
      name: `${issuer.admin1?.firstName || ""} ${
        issuer.admin1?.lastName || ""
      }`,
    },
    {
      role: "ADMIN2",
      email: issuer.admin2?.email,
      name: `${issuer.admin2?.firstName || ""} ${
        issuer.admin2?.lastName || ""
      }`,
    },
    {
      role: "ADMIN3",
      email: issuer.admin3?.email,
      name: `${issuer.admin3?.firstName || ""} ${
        issuer.admin3?.lastName || ""
      }`,
    },
  ];

  for (const user of recipients) {
    if (!user.email) {
      console.log(`⏭️ Skipping ${user.role} (email missing)`);
      continue;
    }

    try {
      console.log(`📨 Sending welcome email to ${user.role}: ${user.email}`);

      const payload = {
        from: adminEmail, // 👈 ADMIN sender
        to: user.email, // 👈 USER's OWN EMAIL
        subject: "Welcome to BadgeConnect 🎉",
        template: "welcome-issuer",
        variables: {
          recipientName: user.name || "User",
          recipientRole: user.role,
          orgName: issuer.orgName,
          orgEmail: issuer.orgEmail,
          supportEmail: issuer.supportEmail,
          // ✅ IMPORTANT FIX
          personEmail: user.email, // 👈 LOGIN EMAIL (INDIVIDUAL)

          // template expects website static
          website: "https://badgeconnect.com/issuer",
        },
      };

      console.log("📤 Email payload:", payload);

      await axios.post(
        `${process.env.EMAIL_SERVICE_BASE_URL}/email/email-send`,
        payload,
        {
          headers: {
            "x-internal-api-key": process.env.EMAIL_SERVICE_INTERNAL_KEY,
          },
        }
      );

      console.log(`✅ Welcome email sent to ${user.role}`);
    } catch (err) {
      console.error(
        `❌ Failed to send email to ${user.role}:`,
        err.response?.data || err.message
      );
    }
  }
}

export async function createIssuer(req, res) {
  try {
    const adminEmail = req.admin?.email;

    if (!adminEmail) {
      return sendError(res, "Unauthorized admin", 401);
    }

    console.log("🆕 Admin creating issuer:", adminEmail);

    const payload = normalizeIssuerPayload(req.body);

    const issuer = await Issuer.create({
      ...payload,
      addedByAdmin: adminEmail,
      lastUpdatedBy: null,
    });

    console.log("✅ Issuer created:", issuer.issuerId);

    // 🔔 SEND WELCOME EMAIL TO EACH USER (NON-BLOCKING)
    sendWelcomeIssuerEmailsIndividually({
      issuer,
      adminEmail,
    });

    return sendSuccess(
      res,
      normalizeIssuerDoc(issuer),
      "Issuer created successfully",
      201
    );
  } catch (err) {
    console.error("CREATE ISSUER ERROR:", err);

    if (err.code === 11000 && err.keyPattern?.orgEmail) {
      return sendError(res, "Organization email already exists", 400);
    }

    return sendError(res, err.message || "Failed to create issuer", 500);
  }
}

/* ------------------------------------------------------------------
   GET ALL ISSUERS
------------------------------------------------------------------ */
export async function getIssuers(req, res) {
  try {
    const issuers = await Issuer.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .lean();

    const normalized = issuers.map(normalizeIssuerDoc);

    return sendSuccess(res, normalized, "Issuers fetched successfully", 200);
  } catch (err) {
    console.error("GET ISSUERS ERROR:", err);
    return sendError(res, "Failed to fetch issuers", 500);
  }
}

/* ------------------------------------------------------------------
   GET SINGLE ISSUER
------------------------------------------------------------------ */
export async function getIssuerById(req, res) {
  try {
    const { id } = req.params;

    if (!id || typeof id !== "string") {
      return sendError(res, "Invalid issuer ID", 400);
    }

    const issuer = await Issuer.findOne({
      issuerId: id,
      isDeleted: false,
    });

    if (!issuer) {
      return sendError(res, "Issuer not found", 404);
    }

    return sendSuccess(
      res,
      normalizeIssuerDoc(issuer),
      "Issuer fetched successfully",
      200
    );
  } catch (err) {
    console.error("GET ISSUER ERROR:", err);
    return sendError(res, "Failed to fetch issuer", 500);
  }
}

/* ------------------------------------------------------------------
   UPDATE ISSUER
------------------------------------------------------------------ */
export async function updateIssuer(req, res) {
  try {
    const adminEmail = req.admin?.email;

    if (!adminEmail) {
      return sendError(res, "Unauthorized admin", 401);
    }

    const { id } = req.params;

    const existing = await Issuer.findOne({
      issuerId: id,
      isDeleted: false,
    });

    if (!existing) {
      return sendError(res, "Issuer not found", 404);
    }

    const payload = normalizeIssuerPayload(req.body);

    Object.assign(existing, payload);
    existing.lastUpdatedBy = adminEmail;

    await existing.save();

    return sendSuccess(
      res,
      normalizeIssuerDoc(existing),
      "Issuer updated successfully",
      200
    );
  } catch (err) {
    console.error("UPDATE ISSUER ERROR:", err);
    return sendError(res, err.message || "Failed to update issuer", 500);
  }
}

/* ------------------------------------------------------------------
   DELETE ISSUER
------------------------------------------------------------------ */
export async function deleteIssuer(req, res) {
  try {
    const { id } = req.params;

    const issuer = await Issuer.findOne({ issuerId: id });

    if (!issuer) {
      return sendError(res, "Issuer not found", 404);
    }

    if (issuer.isDeleted) {
      return sendError(res, "Issuer already deleted", 400);
    }

    issuer.isDeleted = true;
    await issuer.save();

    return sendSuccess(
      res,
      { issuerId: id },
      "Issuer deleted successfully",
      200
    );
  } catch (err) {
    console.error("DELETE ISSUER ERROR:", err);
    return sendError(res, "Failed to delete issuer", 500);
  }
}
