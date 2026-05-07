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
  if (!uniqueIds.length)
    return {
      ...org,
      primaryContact: null,
      admin1: null,
      admin2: null,
      admin3: null,
    };

  console.log(
    "🔍 [populateOrgUsers] fetching active users for ids:",
    uniqueIds,
  );

  const users = await Promise.all(
    uniqueIds.map(async (userId) => {
      try {
        const result = await callUserService("get", `/internal/user/${userId}`);
        return result?.data || null;
      } catch {
        console.warn("⚠️ [populateOrgUsers] could not fetch user:", userId);
        return null;
      }
    }),
  );

  // Build map — only keep users who are active issuers
  const userMap = {};
  users.filter(Boolean).forEach((u) => {
    const isActiveIssuer =
      u.status === "active" && !u.isDeleted && u.userScope === "issuer";

    if (isActiveIssuer) userMap[u.userId] = u;
    else
      console.warn(
        "⚠️ [populateOrgUsers] skipping inactive/non-issuer user:",
        u.userId,
      );
  });

  return {
    ...org,
    primaryContact: userMap[slotEntries.primaryContact] ?? null,
    admin1: userMap[slotEntries.admin1] ?? null,
    admin2: userMap[slotEntries.admin2] ?? null,
    admin3: userMap[slotEntries.admin3] ?? null,
  };
}

async function syncOrgToUserService(org, actorEmail = null) {
  if (!org?.orgId || !org?.orgName || !org?.orgEmail) {
    throw new Error("Cannot sync organization without orgId, orgName, and orgEmail");
  }

  await callUserService("put", `/internal/org/${org.orgId}`, {
    orgName: org.orgName,
    orgEmail: org.orgEmail,
    website: org.website || null,
    supportEmail: org.supportEmail || null,
    postal: org.postal || null,
    onboardingType: org.onboardingType || "badgecert",
    apiAuthKey: typeof org.apiAuthKey === "string" ? org.apiAuthKey : undefined,
    addedByAdmin: org.addedByAdmin,
    lastUpdatedBy: actorEmail || org.lastUpdatedBy || null,
    status: org.status,
    isDeleted: org.isDeleted,
  });
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
      orgName,
      orgEmail,
      website,
      supportEmail,
      postal,
      onboardingType,
      primaryContact,
      admin1,
      admin2,
      admin3,
      reminderSettings,
    } = req.body;

    console.log("🆕 [createIssuer] admin:", adminEmail);
    console.log(
      "📥 [createIssuer] payload:",
      JSON.stringify(req.body, null, 2),
    );

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
      onboardingType: onboardingType || "badgecert",
      addedByAdmin: adminEmail.trim().toLowerCase(),
      ...(reminderSettings ? { reminderSettings } : {}),
      primaryContact: [],
      admin1: [],
      admin2: [],
      admin3: [],
    });

    const orgId = org.orgId;
    console.log("✅ [createIssuer] Organization created:", orgId);

    try {
      await syncOrgToUserService(org, adminEmail.trim().toLowerCase());
      console.log("✅ [createIssuer] organization synced to badgeconnect_user:", orgId);
    } catch (err) {
      await Organization.deleteOne({ orgId });
      console.error("❌ [createIssuer] org sync failed, rolling back local org:", err.message);
      return sendError(res, "Failed to sync organization", 500);
    }

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

        const result = await callUserService(
          "post",
          "/internal/user",
          userPayload,
        );

        slotResults[key] = result.data.userId;
        createdUserIds.push(result.data.userId);
        console.log(
          `✅ [createIssuer] user created for ${key}:`,
          result.data.userId,
        );
      } catch (err) {
        // User creation failed — rollback org and any users already created
        console.error(
          `❌ [createIssuer] user creation failed for ${key}:`,
          err?.response?.data?.message || err.message,
        );

        // Rollback: soft delete already-created users
        for (const userId of createdUserIds) {
          try {
            await callUserService("delete", `/internal/user/${userId}`);
            console.log("🔄 [createIssuer] rolled back user:", userId);
          } catch (rbErr) {
            console.error(
              "❌ [createIssuer] rollback failed for user:",
              userId,
              rbErr.message,
            );
          }
        }

        // Hard delete org — it has no users yet, clean removal
        await Organization.deleteOne({ orgId });
        console.log("🔄 [createIssuer] rolled back org:", orgId);

        const message =
          err?.response?.data?.message || "Failed to create issuer user";
        return sendError(res, message, err?.response?.status || 500);
      }
    }

    // ── Step 3: Write userIds back into org arrays ────────────────
    await Organization.updateOne(
      { orgId },
      {
        primaryContact: slotResults.primaryContact
          ? [slotResults.primaryContact]
          : [],
        admin1: slotResults.admin1 ? [slotResults.admin1] : [],
        admin2: slotResults.admin2 ? [slotResults.admin2] : [],
        admin3: slotResults.admin3 ? [slotResults.admin3] : [],
      },
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
      onboardingType: fullOrg.onboardingType || "badgecert",
      addedByAdmin: fullOrg.addedByAdmin,
      reminderSettings: fullOrg.reminderSettings,
      primaryContact: slotResults.primaryContact
        ? { userId: slotResults.primaryContact, ...primaryContact }
        : null,
      admin1: slotResults.admin1
        ? { userId: slotResults.admin1, ...admin1 }
        : null,
      admin2: slotResults.admin2
        ? { userId: slotResults.admin2, ...admin2 }
        : null,
      admin3: slotResults.admin3
        ? { userId: slotResults.admin3, ...admin3 }
        : null,
      createdAt: fullOrg.createdAt,
    };

    console.log(
      "📤 [createIssuer] response:",
      JSON.stringify(responseData, null, 2),
    );

    const verificationRequested = await triggerOrgEmailVerification({
      orgId,
      orgName: fullOrg.orgName,
      orgEmail: fullOrg.orgEmail,
      requestedBy: adminEmail,
    });

    responseData.orgEmailVerificationRequested = verificationRequested;

    // ── Step 4: Welcome emails (non-blocking) ─────────────────────
    sendWelcomeEmails({ issuer: responseData, adminEmail }).catch((err) =>
      console.error("❌ [createIssuer] welcome email error:", err.message),
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
    console.log(
      "📥 [updateIssuer] payload:",
      JSON.stringify(req.body, null, 2),
    );

    const org = await Organization.findOne({ orgId: id, isDeleted: false });
    if (!org) return sendError(res, "Issuer not found", 404);

    const hasEarners = await issuerHasEarners(id);
    console.log("🔒 [updateIssuer] hasEarners:", hasEarners);

    const {
      orgName,
      orgEmail,
      website,
      supportEmail,
      postal,
      onboardingType,
      reminderSettings,
      apiAuthKey,
      primaryContact,
      admin1,
      admin2,
      admin3,
    } = req.body;

    // ── Update org-level fields (locked if has earners) ──────────
    const nextOrgEmail =
      typeof orgEmail === "string" ? orgEmail.trim().toLowerCase() : "";
    const orgEmailChanged = Boolean(
      !hasEarners && nextOrgEmail && nextOrgEmail !== org.orgEmail,
    );

    if (!hasEarners) {
      if (orgName) org.orgName = orgName;
      if (nextOrgEmail) org.orgEmail = nextOrgEmail;
      if (website) org.website = website;
      if (supportEmail) org.supportEmail = supportEmail;
      if (postal) org.postal = postal;
      if (onboardingType) org.onboardingType = onboardingType;
    } else {
      console.log("⚠️ [updateIssuer] org fields locked — earners exist");
    }

    if (reminderSettings) org.reminderSettings = reminderSettings;
    if (onboardingType) org.onboardingType = onboardingType;
    if (typeof apiAuthKey === "string") org.apiAuthKey = apiAuthKey.trim();
    org.lastUpdatedBy = adminEmail.trim().toLowerCase();

    await org.save();
    console.log("✅ [updateIssuer] org saved:", id);

    let verificationRequested = false;
    if (orgEmailChanged) {
      verificationRequested = await triggerOrgEmailVerification({
        orgId: org.orgId,
        orgName: org.orgName,
        orgEmail: org.orgEmail,
        requestedBy: adminEmail,
      });
    }

    // ── Update/Create user details via badgeconnect_user ─────────────
    const contactUpdates = [
      { slot: "primaryContact", data: primaryContact },
      { slot: "admin1", data: admin1 },
      { slot: "admin2", data: admin2 },
      { slot: "admin3", data: admin3 },
    ];
    const removableSlots = new Set(["admin2", "admin3"]);

    const slotsToUpdate = []; // Track slots that need org array update

    for (const { slot, data } of contactUpdates) {
      const userIds = org[slot];
      const existingUserId =
        userIds.length > 0 ? userIds[userIds.length - 1] : null;
      const newEmail = data?.email?.trim().toLowerCase() || "";

      if (!newEmail) {
        if (removableSlots.has(slot) && existingUserId) {
          console.log(
            `🗑️ [updateIssuer] clearing ${slot} user:`,
            existingUserId,
          );

          try {
            await callUserService("delete", `/internal/user/${existingUserId}`);
            slotsToUpdate.push({ slot, userIds: [] });
            console.log(
              `✅ [updateIssuer] ${slot} cleared and user deactivated:`,
              existingUserId,
            );
          } catch (err) {
            console.warn(
              `⚠️ [updateIssuer] failed to clear ${slot}:`,
              err?.message || err,
            );
          }
        }
        continue;
      }

      // Fetch existing user to compare email
      let existingUser = null;
      if (existingUserId) {
        try {
          const res = await callUserService(
            "get",
            `/internal/user/${existingUserId}`,
          );
          existingUser = res?.data || null;
        } catch {}
      }

      const existingEmail = existingUser?.email?.trim().toLowerCase();
      const emailChanged = existingEmail && existingEmail !== newEmail;

      if (emailChanged) {
        // Email changed — deactivate old user and create new one
        console.log(
          `🔄 [updateIssuer] email changed for ${slot}: ${existingEmail} → ${newEmail}`,
        );

        try {
          // Step 1: Mark old user as inactive/deleted
          await callUserService("delete", `/internal/user/${existingUserId}`);
          console.log(
            `✅ [updateIssuer] old user deactivated: ${existingUserId}`,
          );
        } catch (err) {
          console.warn(
            `⚠️ [updateIssuer] failed to deactivate old user ${existingUserId}:`,
            err.message,
          );
        }

        // Step 2: Create new user with new email
        try {
          const userPayload = {
            orgId: org.orgId,
            orgName: org.orgName,
            orgDept: data.orgDept || undefined,
            firstName: data.firstName || undefined,
            lastName: data.lastName || undefined,
            email: newEmail,
            userScope: "issuer",
            createdBy: adminEmail,
          };

          const result = await callUserService(
            "post",
            "/internal/user",
            userPayload,
          );
          const newUserId = result.data.userId;

          // Update org array with new userId (append, don't replace — keeps history)
          userIds.push(newUserId);
          slotsToUpdate.push({ slot, userIds });
          console.log(
            `✅ [updateIssuer] new user created for ${slot}:`,
            newUserId,
          );
        } catch (err) {
          console.warn(
            `⚠️ [updateIssuer] user creation failed for ${slot}:`,
            err?.response?.data?.message || err.message,
          );
        }
      } else if (existingUserId) {
        // Email same or no change — just update user fields
        const updatePayload = {
          firstName: data.firstName || undefined,
          lastName: data.lastName || undefined,
          orgDept: data.orgDept || undefined,
          lastUpdatedBy: adminEmail,
        };

        console.log(
          `📡 [updateIssuer] updating user ${existingUserId} for slot ${slot}`,
        );

        try {
          await callUserService(
            "put",
            `/internal/user/${existingUserId}`,
            updatePayload,
          );
          console.log(
            `✅ [updateIssuer] user updated for ${slot}:`,
            existingUserId,
          );
        } catch (err) {
          console.warn(
            `⚠️ [updateIssuer] user update failed for ${slot}:`,
            err.message,
          );
        }
      } else {
        // No user exists for this slot — create new user
        console.log(
          `🆕 [updateIssuer] creating new user for ${slot}:`,
          newEmail,
        );

        try {
          const userPayload = {
            orgId: org.orgId,
            orgName: org.orgName,
            orgDept: data.orgDept || undefined,
            firstName: data.firstName || undefined,
            lastName: data.lastName || undefined,
            email: newEmail,
            userScope: "issuer",
            createdBy: adminEmail,
          };

          const result = await callUserService(
            "post",
            "/internal/user",
            userPayload,
          );
          const newUserId = result.data.userId;

          userIds.push(newUserId);
          slotsToUpdate.push({ slot, userIds });
          console.log(`✅ [updateIssuer] user created for ${slot}:`, newUserId);
        } catch (err) {
          console.warn(
            `⚠️ [updateIssuer] user creation failed for ${slot}:`,
            err?.response?.data?.message || err.message,
          );
        }
      }
    }

    // Update org arrays with new userIds (only for slots that changed)
    if (slotsToUpdate.length > 0) {
      const updateOps = {};
      for (const { slot, userIds } of slotsToUpdate) {
        updateOps[slot] = userIds;
      }
      await Organization.updateOne({ orgId: id }, { $set: updateOps });
      console.log(
        "✅ [updateIssuer] org arrays updated for slots:",
        slotsToUpdate.map((s) => s.slot),
      );
    }

    return sendSuccess(
      res,
      { orgId: id, orgEmailVerificationRequested: verificationRequested },
      "Issuer updated successfully",
    );
  } catch (err) {
    console.error("❌ [updateIssuer] error:", err.message);
    return sendError(res, err.message || "Failed to update issuer", 500);
  }
}

export async function resendOrgEmailVerification(req, res) {
  try {
    const adminEmail = req.admin?.email;
    if (!adminEmail) return sendError(res, "Unauthorized admin", 401);

    const { id } = req.params;
    const org = await Organization.findOne({ orgId: id, isDeleted: false }).lean();

    if (!org) return sendError(res, "Issuer not found", 404);

    const triggered = await triggerOrgEmailVerification({
      orgId: org.orgId,
      orgName: org.orgName,
      orgEmail: org.orgEmail,
      requestedBy: adminEmail,
    });

    if (!triggered) {
      return sendError(res, "Failed to trigger organization email verification", 500);
    }

    return sendSuccess(
      res,
      {
        orgId: org.orgId,
        orgEmail: org.orgEmail,
      },
      "Organization email verification sent",
    );
  } catch (err) {
    console.error("❌ [resendOrgEmailVerification] error:", err.message);
    return sendError(
      res,
      err.message || "Failed to trigger organization email verification",
      500,
    );
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
    org.lastUpdatedBy = req.admin?.email?.trim().toLowerCase() || null;
    await org.save();
    console.log("✅ [deleteIssuer] org soft deleted:", id);

    try {
      await syncOrgToUserService(org, req.admin?.email?.trim().toLowerCase() || null);
      console.log("✅ [deleteIssuer] org status synced to badgeconnect_user:", id);
    } catch (err) {
      console.warn("⚠️ [deleteIssuer] org sync failed:", err.message);
    }

    // Soft delete all linked users in badgeconnect_user
    for (const userId of allUserIds) {
      try {
        await callUserService("delete", `/internal/user/${userId}`);
        console.log("✅ [deleteIssuer] user deactivated:", userId);
      } catch (err) {
        console.warn(
          "⚠️ [deleteIssuer] could not deactivate user:",
          userId,
          err.message,
        );
        // Non-fatal — continue deactivating others
      }
    }

    console.log(
      "📤 [deleteIssuer] complete — users deactivated:",
      allUserIds.length,
    );
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
      { headers: { "x-internal-key": process.env.EARNER_EXISTANCE_KEY } },
    );
    const hasEarners = Boolean(response.data?.hasEarners);
    console.log("✅ [issuerHasEarners] result:", hasEarners);
    return hasEarners;
  } catch (err) {
    console.error(
      "❌ [issuerHasEarners] check failed — defaulting to locked:",
      err.message,
    );
    return true; // fail closed
  }
}

async function triggerOrgEmailVerification({
  orgId,
  orgName,
  orgEmail,
  requestedBy,
}) {
  try {
    await axios.post(
      `${process.env.EMAIL_SERVICE_BASE_URL}/email/org-email-verification`,
      {
        orgId,
        orgName,
        orgEmail,
        requestedBy,
      },
      {
        headers: {
          "x-internal-api-key": process.env.EMAIL_SERVICE_INTERNAL_KEY,
        },
      },
    );

    console.log("✅ [triggerOrgEmailVerification] verification requested", {
      orgId,
      orgEmail,
    });
    return true;
  } catch (err) {
    console.error("❌ [triggerOrgEmailVerification] failed:", {
      orgId,
      orgEmail,
      message: err?.response?.data?.message || err.message,
    });
    return false;
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
          from: process.env.EMAIL_SENDER_SES,
          to: contact.email,
          subject: "Welcome to BadgeConnect 🎉",
          template: "welcome-issuer",
          variables: {
            recipientName:
              `${contact.firstName || ""} ${contact.lastName || ""}`.trim(),
            recipientRole: contact.role,
            orgName: issuer.orgName,
            orgEmail: issuer.orgEmail,
            supportEmail: issuer.supportEmail,
            personEmail: contact.email,
            website: "https://badgeconnect.com/issuer",
          },
        },
        {
          headers: {
            "x-internal-api-key": process.env.EMAIL_SERVICE_INTERNAL_KEY,
          },
        },
      );
      console.log(
        `✅ [sendWelcomeEmails] sent to ${contact.role}: ${contact.email}`,
      );
    } catch (err) {
      console.error(
        `❌ [sendWelcomeEmails] failed for ${contact.role}:`,
        err.message,
      );
    }
  }
}
