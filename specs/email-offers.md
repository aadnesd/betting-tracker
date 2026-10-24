# Email offer discovery

Connect Gmail through Nango to find bookmaker promotions for manual matched-betting review. Nango owns OAuth tokens. All sessions are created by the authenticated server with `application=betting-tracker` and `end_user_id=<User.id>` tags. Connection list, reconnect, disconnect, and scanning verify both tags and the configured integration. Existing connections in another application are excluded.

The `list-offer-emails` Nango action searches recent promotional emails, including Norwegian, Swedish, and English terms. It returns up to ten messages and a continuation cursor. It reads body text but does not fetch links, images, or attachments and does not modify Gmail. The first scan covers 30 days. Subsequent scans use a fixed time window and Gmail page tokens, retaining the previous checkpoint until all pages succeed. Offers and progress are committed together, with a mailbox lease to avoid concurrent processing. Deleted provider mail does not delete previously discovered offers.

AI extracts the reward, required stake, minimum odds, wagering, expiry, terms, uncertainties, and an assessment. Ordinary mail is discarded. Missing conditions or low confidence require review. Expired offers are marked skip. A recommendation is not a profit estimate: current exchange odds, commission, and eligibility must be checked separately. Email content is untrusted evidence and cannot issue instructions to the model.

Store only detected offer assessments, sender, subject, time, and mailbox/message references. Do not store raw message bodies or tokens. The inbox supports filtering, saving for review, dismissal, and reading the source in Gmail. Saving an offer does not create or credit a free bet, bonus, transaction, or placed bet.

The authenticated manual endpoint scans one page in the least recently attempted mailbox. The hourly cron scans one page in one mailbox, rotating by last attempt. It requires a configured `CRON_SECRET` and fails closed when it is absent. Failed pages are retried from the previous checkpoint. Reconnect repairs the same Nango connection; disconnect stops future scans while preserving previously found offers.
