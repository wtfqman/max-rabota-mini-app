import { ReviewStatus, type PrismaClient, type Review } from '@rabst24/db';

export interface ReviewCreateData {
  adId?: string;
  rating?: number;
  text?: string;
}

export type ReviewWithAuthor = Review & {
  author: {
    id: string;
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    maxUsername: string | null;
  };
};

export class ReviewRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(authorId: string, subjectId: string, dto: ReviewCreateData): Promise<Review> {
    return this.db.review.create({
      data: {
        authorId,
        subjectId,
        adId: dto.adId,
        rating: dto.rating ?? 5,
        text: dto.text,
        status: ReviewStatus.PUBLISHED,
        publishedAt: new Date()
      }
    });
  }

  async listForUser(userId: string): Promise<ReviewWithAuthor[]> {
    return this.db.review.findMany({
      where: {
        subjectId: userId,
        status: ReviewStatus.PUBLISHED,
        deletedAt: null
      },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            firstName: true,
            lastName: true,
            maxUsername: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }
}
