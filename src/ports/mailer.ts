export type OutgoingMail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export interface Mailer {
  send(mail: OutgoingMail): Promise<void>;
}
