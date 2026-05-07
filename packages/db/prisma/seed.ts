import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const metroStations = [
  {
    city: 'Москва',
    name: 'Павелецкая',
    lineName: 'Замоскворецкая',
    lineColor: '#2D9445',
    externalCode: 'moscow-paveletskaya-zamoskvoretskaya'
  },
  {
    city: 'Москва',
    name: 'Курская',
    lineName: 'Кольцевая',
    lineColor: '#8D5B2D',
    externalCode: 'moscow-kurskaya-koltsevaya'
  },
  {
    city: 'Москва',
    name: 'Комсомольская',
    lineName: 'Сокольническая',
    lineColor: '#E42313',
    externalCode: 'moscow-komsomolskaya-sokolnicheskaya'
  }
];

async function main(): Promise<void> {
  for (const station of metroStations) {
    await prisma.metroStation.upsert({
      where: {
        city_name_lineName: {
          city: station.city,
          name: station.name,
          lineName: station.lineName
        }
      },
      update: {
        lineColor: station.lineColor,
        externalCode: station.externalCode,
        isActive: true
      },
      create: station
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
