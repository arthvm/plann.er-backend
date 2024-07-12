import "dayjs/locale/pt-br";
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { dayjs } from "../lib/dayjs";
import { getMailClient } from "../lib/mail";
import nodemailer from "nodemailer";
import { ClientError } from "../errors/client-error";
import { env } from "../env";

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
        throw new ClientError("Trip not found.");
      }

      const redirectUrl = `${env.WEB_BASE_URL}/trips/${tripId}`;

      if (trip.is_confirmed) {
        return reply.send({ redirectUrl }).code(200);
      }

      await prisma.trip.update({
        where: {
          id: tripId,
        },
        data: {
          is_confirmed: true,
        },
      });

      const formattedStartDate = dayjs(trip.starts_at).format("LL");
      const formattedEndDate = dayjs(trip.ends_at).format("LL");

      const mail = await getMailClient();
      await Promise.all(
        trip.participants.map(async (participant) => {
          const confirmationLink = `${env.WEB_BASE_URL}/participants/${participant.id}/confirm`;

          const message = await mail.sendMail({
            from: {
              name: "Equipe Planner",
              address: "teste@plann.er",
            },
            to: participant.email,
            subject: `Confirme sua presenca na viagem para ${trip.destination} em ${formattedStartDate}`,
            html: `
            <div style="font-family: sans-serif; font-size: 16px; line-height: 1.6;">
              <p>Voce foi convidado para participar de uma viagem para <strong>${trip.destination}</strong> nas datas de <strong>${formattedStartDate}</strong> ate <strong>${formattedEndDate}</strong></p>
              <p></p>
              <p>Para confirmar a sua presenca na viagem, clique no link abaixo:</p>
              <p></p>
              <p><a href="${confirmationLink}">Confirmar presenca</a></p>
              <p></p>
              <p>Caso voce nao saiba do que se trata esse email ou nao podera estar presente, apenas ignore esse email</p>
            </div>
            `.trim(),
          });
        })
      );

      return reply.send({ redirectUrl }).code(200);
    }
  );
}
