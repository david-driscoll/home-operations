import { Client } from '@pulumi/adguard'

export function configureAdGuard(args: { clients: { name: string; ip: string }[] }) {
//   for (const client of args.clients) {
//     new Client(`adguard-${client.name}`, {
//         name: client.name,
//         ids: [client.ip],
//         ignoreQuerylog: true,
//         ignoreStatistics: true,
//     });
//   }
}
