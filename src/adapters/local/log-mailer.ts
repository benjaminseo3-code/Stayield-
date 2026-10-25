import type { Mailer, OutgoingMail } from "@/ports/mailer";

/** Demo mailer: nothing is delivered and bodies (which may hold links) are never logged. */
export class LogMailer implements Mailer {
  async send(mail: OutgoingMail): Promise<void> {
    console.log(`[mail disabled] to=<redacted> subject=${JSON.stringify(mail.subject)}`);
  }
}
