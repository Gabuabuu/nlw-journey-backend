import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import dayjs from "dayjs";
import localizedFormat from 'dayjs/plugin/localizedFormat'
import 'dayjs/locale/pt-br'
import nodemailer from "nodemailer";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { getMailClient } from "../lib/mail";

dayjs.locale('pt-br')
dayjs.extend(localizedFormat)

export async function createTrip(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/trips",
    {
      schema: {
        body: z.object({
          destination: z.string().min(4),
          starts_at: z.coerce.date(),
          ends_at: z.coerce.date(),
          owner_name: z.string(),
          owner_email: z.string().email(),
          emails_to_invite: z.array(z.string().email()),
        }),
      },
    },
    async (request) => {
      const {
        destination,
        starts_at,
        ends_at,
        owner_name,
        owner_email,
        emails_to_invite,
      } = request.body;

      if (dayjs(starts_at).isBefore(new Date())) {
        throw new Error("Invalid trip start date ");
      }
      if (dayjs(ends_at).isBefore(starts_at)) {
        throw new Error("Invalid trip end date ");
      }

      const trip = await prisma.trip.create({
        data: {
          destination,
          starts_at,
          ends_at,
          participants: {
            createMany: {
              data: [
                {
                  name: owner_name,
                  email: owner_email,
                  is_owner: true,
                  is_confirmed: true,
                },
                ...emails_to_invite.map((email) => {
                  return { email };
                }),
              ],
            },
          },
        },
      });

      const fomartedStartDate = dayjs(starts_at).format('LL')
      const fomartedEndDate = dayjs(ends_at).format('LL')

      const confirmationLink = `http:/localhost:3333/trips/${trip.id}/confirm`

      const mail = await getMailClient();

      const message = await mail.sendMail({
        from: {
          name: "Equipe Gabu Flight",
          address: "gabu@flight",
        },
        to: {
          name: owner_name,
          address: owner_email,
        },
        subject: `Confirme sua viagem para ${destination}`,
        html: `
        <div style="font-family: sans-serif; font-size: 16; line-height: 1.6;">
              <p>
                Voce solicitou a criação de uma viagem para <strong>${destination}</strong>, Brasil. Nas datas
                datas de <strong>${fomartedStartDate}</strong> até <strong>${fomartedEndDate}</strong>.
              </p>

              <p>Para confirmar sua viagem, clique no link abaixo:</p>

              <p>
                <a href="${confirmationLink}">Confirmar viagem</a>
              </p>

              <p>
                Caso esteja usando o dispositivo móvel, voce também pode confirmar a criação
                da viagem pelo aplicativo.
              </p>
          </div>

        `.trim(),
      });

      console.log(nodemailer.getTestMessageUrl(message));

      return { tripId: trip.id };
    }
  );
}
