import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { dayjs } from "../lib/dayjs";
import { getMailClient } from "../lib/mail";
import nodemailer from "nodemailer";

export async function confirmTrip(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/trips/:tripId/confirm",
    {
      schema: {
        params: z.object({
          tripId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { tripId } = request.params;

      const trip = await prisma.trip.findUnique({
        where: {
          id: tripId,
        },
        include: {
          participants: {
            where: {
              is_owner: false,
            },
          },
        },
      });

      if (!trip) {
        throw new Error("Trip not found.");
      }

      if (trip.is_confirmed) {
        return reply.redirect(`http://localhost:3000/trips/${tripId}`);
      }

      await prisma.trip.update({
        where: { id: tripId },
        data: { is_confirmed: true },
      });

      const fomartedStartDate = dayjs(trip.starts_at).format("LL");
      const fomartedEndDate = dayjs(trip.ends_at).format("LL");

      const mail = await getMailClient();

      await Promise.all(
        trip.participants.map(async (participant) => {
          const confirmationLink = `http:/localhost:3333/trips/${trip.id}/confirm/${participant.id}`;

          const message = await mail.sendMail({
            from: {
              name: "Equipe Gabu Flight",
              address: "gabu@flight",
            },
            to: participant.email,
            subject: `Confirme sua presença na viagem para ${trip.destination} em ${fomartedStartDate}`,
            html: `
            <div style="font-family: sans-serif; font-size: 16; line-height: 1.6;">
                  <p>
                    Você foi convidado para participar de uma viagem para <strong>${trip.destination}</strong> nas datas
                    de <strong>${fomartedStartDate}</strong> até <strong>${fomartedEndDate}</strong>.
                  </p>
    
                  <p>Para confirmar sua presença viagem, clique no link abaixo:</p>
    
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
        })
      );

      return reply.redirect(`http://localhost:3000/trips/${tripId}`);
    }
  );
}
