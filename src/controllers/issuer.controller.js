// src/controllers/issuer.controller.js

import Organization from "../models/organization.model.js";
import { callUserService } from "../utils/internalRequest.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";
import axios from "axios";

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

/**
 * Fetches user details from badgeconnect_user and maps them
 * back into org slot arrays for response population.
 */
async function populateOrgUsers(org) {
  // Only take the LAST userId from each slot (the active one)
  const slotEntries = {
    primaryContact: org.primaryContact?.at(-1) ?? null,
    admin1: org.admin1?.at(-1) ?? null,
    admin2: org.admin2?.at(-1) ?? null,
    admin3: org.admin3?.at(-1) ?? null,
  };

  const uniqueIds = [...new Set(Object.values(slotEntries).filter(Boolean))];
  if (!uniqueIds.length) return { ...org, primaryContact: null, admin1: null, admin2: null, admin3: null };

  console.log("🔍 [populateOrgUsers] fetching active users for ids:", uniqueIds);

  const users = await Promise.all(
    uniqueIds.map(async (userId) => {
      try {
        const result = await callUserService("get", `/internal/user/${userId}`);
        return result?.data || null;
      } catch {
        console.warn("⚠️ [populateOrgUsers] could not fetch user:", userId);
        return null;
      }
    })
  );

  // Build map — only keep users who are active issuers
  const userMap = {};
  users.filter(Boolean).forEach((u) => {
    const isActiveIssuer =
      u.status === "active" &&
      !u.isDeleted &&
      u.userScope === "issuer";

    if (isActiveIssuer) userMap[u.userId] = u;
    else console.warn("⚠️ [populateOrgUsers] skipping inactive/non-issuer user:", u.userId);
  });

  return {
    ...org,
    primaryContact: userMap[slotEntries.primaryContact] ?? null,
    admin1: userMap[slotEntries.admin1] ?? null,
    admin2: userMap[slotEntries.admin2] ?? null,
    admin3: userMap[slotEntries.admin3] ?? null,
  };
}

// ─────────────────────────────────────────────
//  POST /issuer
//  Creates org in local DB + users in badgeconnect_user
// ─────────────────────────────────────────────
export async function createIssuer(req, res) {
  try {
    const adminEmail = req.admin?.email;
    if (!adminEmail) return sendError(res, "Unauthorized admin", 401);

    const {
      orgName, orgEmail, website, supportEmail, postal,
      primaryContact, admin1, admin2, admin3,
      reminderSettings,
    } = req.body;

    console.log("🆕 [createIssuer] admin:", adminEmail);
    console.log("📥 [createIssuer] payload:", JSON.stringify(req.body, null, 2));

    if (!orgName || !orgEmail) {
      return sendError(res, "orgName and orgEmail are required", 400);
    }

    if (!primaryContact?.email) {
      return sendError(res, "primaryContact email is required", 400);
    }

    // ── Step 1: Create Organization locally ──────────────────────
    const org = await Organization.create({
      orgName,
      orgEmail: orgEmail.trim().toLowerCase(),
      website: website || null,
      supportEmail: supportEmail || null,
      postal: postal || null,
      addedByAdmin: adminEmail.trim().toLowerCase(),
      ...(reminderSettings ? { reminderSettings } : {}),
      primaryContact: [],
      admin1: [],
      admin2: [],
      admin3: [],
    });

    const orgId = org.orgId;
    console.log("✅ [createIssuer] Organization created:", orgId);

    // ── Step 2: Create GlobalUsers in badgeconnect_user ──────────
    const commonPayload = {
      orgId,
      orgName,
      userScope: "issuer",
      createdBy: adminEmail,
    };

    const slots = [
      { key: "primaryContact", data: primaryContact },
      { key: "admin1", data: admin1 },
      { key: "admin2", data: admin2 },
      { key: "admin3", data: admin3 },
    ];

    const slotResults = {};
    const createdUserIds = [];

    for (const { key, data } of slots) {
      if (!data?.email) {
        slotResults[key] = null;
        continue;
      }

      try {
        const userPayload = { ...commonPayload, ...data };
        console.log(`📡 [createIssuer] creating user for ${key}:`, data.email);

        const result = await callUserService("post", "/internal/user", userPayload);

        slotResults[key] = result.data.userId;
        createdUserIds.push(result.data.userId);
        console.log(`✅ [createIssuer] user created for ${key}:`, result.data.userId);
      } catch (err) {
        // User creation failed — rollback org and any users already created
        console.error(`❌ [createIssuer] user creation failed for ${key}:`, err?.response?.data?.message || err.message);

        // Rollback: soft delete already-created users
        for (const userId of createdUserIds) {
          try {
            await callUserService("delete", `/internal/user/${userId}`);
            console.log("🔄 [createIssuer] rolled back user:", userId);
          } catch (rbErr) {
            console.error("❌ [createIssuer] rollback failed for user:", userId, rbErr.message);
          }
        }

        // Hard delete org — it has no users yet, clean removal
        await Organization.deleteOne({ orgId });
        console.log("🔄 [createIssuer] rolled back org:", orgId);

        const message = err?.response?.data?.message || "Failed to create issuer user";
        return sendError(res, message, err?.response?.status || 500);
      }
    }

    // ── Step 3: Write userIds back into org arrays ────────────────
    await Organization.updateOne(
      { orgId },
      {
        primaryContact: slotResults.primaryContact ? [slotResults.primaryContact] : [],
        admin1: slotResults.admin1 ? [slotResults.admin1] : [],
        admin2: slotResults.admin2 ? [slotResults.admin2] : [],
        admin3: slotResults.admin3 ? [slotResults.admin3] : [],
      }
    );

    console.log("✅ [createIssuer] org arrays updated with userIds");

    const fullOrg = await Organization.findOne({ orgId }).lean();

    const responseData = {
      orgId,
      orgName: fullOrg.orgName,
      orgEmail: fullOrg.orgEmail,
      website: fullOrg.website,
      supportEmail: fullOrg.supportEmail,
      postal: fullOrg.postal,
      addedByAdmin: fullOrg.addedByAdmin,
      reminderSettings: fullOrg.reminderSettings,
      primaryContact: slotResults.primaryContact
        ? { userId: slotResults.primaryContact, ...primaryContact }
        : null,
      admin1: slotResults.admin1 ? { userId: slotResults.admin1, ...admin1 } : null,
      admin2: slotResults.admin2 ? { userId: slotResults.admin2, ...admin2 } : null,
      admin3: slotResults.admin3 ? { userId: slotResults.admin3, ...admin3 } : null,
      createdAt: fullOrg.createdAt,
    };

    console.log("📤 [createIssuer] response:", JSON.stringify(responseData, null, 2));

    // ── Step 4: Welcome emails (non-blocking) ─────────────────────
    sendWelcomeEmails({ issuer: responseData, adminEmail }).catch((err) =>
      console.error("❌ [createIssuer] welcome email error:", err.message)
    );

    return sendSuccess(res, responseData, "Issuer created successfully", 201);
  } catch (err) {
    console.error("❌ [createIssuer] error:", err.message);
    if (err.code === 11000) {
      return sendError(res, "Organization email already exists", 400);
    }
    return sendError(res, err.message || "Failed to create issuer", 500);
  }
}

// ─────────────────────────────────────────────
//  GET /issuer
// ─────────────────────────────────────────────
export async function getIssuers(req, res) {
  try {
    console.log("📊 [getIssuers] fetching all orgs");

    const orgs = await Organization.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .lean();

    console.log("✅ [getIssuers] found:", orgs.length, "orgs");

    const populated = await Promise.all(orgs.map(populateOrgUsers));

    console.log("📤 [getIssuers] returning populated orgs");
    return sendSuccess(res, populated, "Issuers fetched successfully");
  } catch (err) {
    console.error("❌ [getIssuers] error:", err.message);
    return sendError(res, "Failed to fetch issuers", 500);
  }
}

// ─────────────────────────────────────────────
//  GET /issuer/:id
// ─────────────────────────────────────────────
export async function getIssuerById(req, res) {
  try {
    const { id } = req.params;
    console.log("🔎 [getIssuerById] orgId:", id);

    const org = await Organization.findOne({ orgId: id, isDeleted: false })
      .select("+apiAuthKey")
      .lean();

    if (!org) return sendError(res, "Issuer not found", 404);

    const [populated, hasEarners] = await Promise.all([
      populateOrgUsers(org),
      issuerHasEarners(id),
    ]);

    const responseData = {
      ...populated,
      _locks: { orgDetailsLocked: hasEarners },
    };

    console.log("📤 [getIssuerById] returning org:", id, "locked:", hasEarners);
    return sendSuccess(res, responseData, "Issuer fetched successfully");
  } catch (err) {
    console.error("❌ [getIssuerById] error:", err.message);
    return sendError(res, "Failed to fetch issuer", 500);
  }
}

// ─────────────────────────────────────────────
//  PUT /issuer/:id
// ─────────────────────────────────────────────
export async function updateIssuer(req, res) {
  try {
    const adminEmail = req.admin?.email;
    if (!adminEmail) return sendError(res, "Unauthorized admin", 401);

    const { id } = req.params;
    console.log("✏️ [updateIssuer] orgId:", id, "admin:", adminEmail);
    console.log("📥 [updateIssuer] payload:", JSON.stringify(req.body, null, 2));

    const org = await Organization.findOne({ orgId: id, isDeleted: false });
    if (!org) return sendError(res, "Issuer not found", 404);

    const hasEarners = await issuerHasEarners(id);
    console.log("🔒 [updateIssuer] hasEarners:", hasEarners);

    const {
      orgName, orgEmail, website, supportEmail, postal,
      reminderSettings, apiAuthKey,
      admin1, admin2, admin3,
    } = req.body;

    // ── Update org-level fields (locked if has earners) ──────────
    if (!hasEarners) {
      if (orgName) org.orgName = orgName;
      if (orgEmail) org.orgEmail = orgEmail.trim().toLowerCase();
      if (website) org.website = website;
      if (supportEmail) org.supportEmail = supportEmail;
      if (postal) org.postal = postal;
    } else {
      console.log("⚠️ [updateIssuer] org fields locked — earners exist");
    }

    if (reminderSettings) org.reminderSettings = reminderSettings;
    if (typeof apiAuthKey === "string") org.apiAuthKey = apiAuthKey.trim();
    org.lastUpdatedBy = adminEmail.trim().toLowerCase();

    await org.save();
    console.log("✅ [updateIssuer] org saved:", id);

    // ── Update user name fields via badgeconnect_user ─────────────
    const contactUpdates = [
      { slot: "admin1", data: admin1 },
      { slot: "admin2", data: admin2 },
      { slot: "admin3", data: admin3 },
    ];

    for (const { slot, data } of contactUpdates) {
      if (!data) continue;

      const userIds = org[slot];
      if (!userIds.length) continue;

      const latestUserId = userIds[userIds.length - 1];
      const updatePayload = {
        firstName: data.firstName || undefined,
        lastName: data.lastName || undefined,
        lastUpdatedBy: adminEmail,
      };

      console.log(`📡 [updateIssuer] updating user ${latestUserId} for slot ${slot}`);

      try {
        await callUserService("put", `/internal/user/${latestUserId}`, updatePayload);
        console.log(`✅ [updateIssuer] user updated for ${slot}:`, latestUserId);
      } catch (err) {
        console.warn(`⚠️ [updateIssuer] user update failed for ${slot}:`, err.message);
        // Non-fatal — org is already saved
      }
    }

    return sendSuccess(res, { orgId: id }, "Issuer updated successfully");
  } catch (err) {
    console.error("❌ [updateIssuer] error:", err.message);
    return sendError(res, err.message || "Failed to update issuer", 500);
  }
}

// ─────────────────────────────────────────────
//  DELETE /issuer/:id
// ─────────────────────────────────────────────
export async function deleteIssuer(req, res) {
  try {
    const { id } = req.params;
    console.log("🗑️ [deleteIssuer] orgId:", id);

    const org = await Organization.findOne({ orgId: id });

    if (!org) return sendError(res, "Issuer not found", 404);
    if (org.isDeleted) return sendError(res, "Issuer already deleted", 400);

    // Collect all userIds linked to this org
    const allUserIds = [
      ...org.primaryContact,
      ...org.admin1,
      ...org.admin2,
      ...org.admin3,
    ].filter(Boolean);

    // Soft delete org locally
    org.isDeleted = true;
    org.status = "inactive";
    await org.save();
    console.log("✅ [deleteIssuer] org soft deleted:", id);

    // Soft delete all linked users in badgeconnect_user
    for (const userId of allUserIds) {
      try {
        await callUserService("delete", `/internal/user/${userId}`);
        console.log("✅ [deleteIssuer] user deactivated:", userId);
      } catch (err) {
        console.warn("⚠️ [deleteIssuer] could not deactivate user:", userId, err.message);
        // Non-fatal — continue deactivating others
      }
    }

    console.log("📤 [deleteIssuer] complete — users deactivated:", allUserIds.length);
    return sendSuccess(res, { orgId: id }, "Issuer deleted successfully");
  } catch (err) {
    console.error("❌ [deleteIssuer] error:", err.message);
    return sendError(res, "Failed to delete issuer", 500);
  }
}

// ─────────────────────────────────────────────
//  INTERNAL HELPERS
// ─────────────────────────────────────────────

async function issuerHasEarners(orgId) {
  try {
    console.log("🔍 [issuerHasEarners] checking orgId:", orgId);
    const response = await axios.get(
      `${process.env.EARNER_SERVICE_BASE_URL}/internal/issuer/${orgId}/has-earners`,
      { headers: { "x-internal-key": process.env.EARNER_EXISTANCE_KEY } }
    );
    const hasEarners = Boolean(response.data?.hasEarners);
    console.log("✅ [issuerHasEarners] result:", hasEarners);
    return hasEarners;
  } catch (err) {
    console.error("❌ [issuerHasEarners] check failed — defaulting to locked:", err.message);
    return true; // fail closed
  }
}

async function sendWelcomeEmails({ issuer, adminEmail }) {
  if (!issuer) return;

  const contacts = [
    { role: "PRIMARY_CONTACT", ...issuer.primaryContact },
    { role: "ADMIN1", ...issuer.admin1 },
    { role: "ADMIN2", ...issuer.admin2 },
    { role: "ADMIN3", ...issuer.admin3 },
  ].filter((c) => c?.email);

  console.log("📧 [sendWelcomeEmails] sending to", contacts.length, "contacts");

  for (const contact of contacts) {
    try {
      await axios.post(
        `${process.env.EMAIL_SERVICE_BASE_URL}/email/email-send`,
        {
          from: adminEmail,
          to: contact.email,
          subject: "Welcome to BadgeConnect 🎉",
          template: "welcome-issuer",
          variables: {
            recipientName: `${contact.firstName || ""} ${contact.lastName || ""}`.trim(),
            recipientRole: contact.role,
            orgName: issuer.orgName,
            orgEmail: issuer.orgEmail,
            supportEmail: issuer.supportEmail,
            personEmail: contact.email,
            website: "https://badgeconnect.com/issuer",
          },
        },
        { headers: { "x-internal-api-key": process.env.EMAIL_SERVICE_INTERNAL_KEY } }
      );
      console.log(`✅ [sendWelcomeEmails] sent to ${contact.role}: ${contact.email}`);
    } catch (err) {
      console.error(`❌ [sendWelcomeEmails] failed for ${contact.role}:`, err.message);
    }
  }
}