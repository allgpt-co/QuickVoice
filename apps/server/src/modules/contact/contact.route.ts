import { createHash, timingSafeEqual } from "node:crypto";
import {
  json,
  Router,
  type ErrorRequestHandler,
  type RequestHandler,
} from "express";

import { sendContactSubmission } from "../../lib/mailer.js";
import { contactSubmissionSchema } from "./contact.schema.js";

const router = Router();

const authenticateContact: RequestHandler = (req, res, next) => {
  const secret = process.env.CONTACT_WEBHOOK_SECRET?.trim();
  if (!secret || secret.length < 32) {
    res.status(503).json({ error: "Contact delivery is not configured" });
    return;
  }

  const supplied = req.get("X-QuickVoice-Contact-Secret") || "";
  // Fixed-size digests permit constant-time comparison even for unequal lengths.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(supplied), digest(secret))) {
    res.status(401).json({ error: "Unauthorized contact delivery" });
    return;
  }

  next();
};

router.post(
  "/contact-delivery",
  authenticateContact,
  json({ limit: "32kb" }),
  async (req, res) => {
    const parsed = contactSubmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid contact submission" });
      return;
    }

    try {
      await sendContactSubmission(parsed.data);
    } catch {
      // Provider responses can contain submitted personal data. Keep them out of
      // public responses and logs; never retry an ambiguous delivery automatically.
      console.error("Contact email delivery failed");
      res
        .status(502)
        .json({ error: "Contact email delivery could not be confirmed" });
      return;
    }

    res.status(200).json({ ok: true });
  },
);

const parseError: ErrorRequestHandler = (error, _req, res, next) => {
  if (error?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Invalid contact JSON" });
    return;
  }
  if (error?.type === "entity.too.large") {
    res.status(413).json({ error: "Contact submission is too large" });
    return;
  }
  next(error);
};
router.use("/contact-delivery", parseError);

export default router;
