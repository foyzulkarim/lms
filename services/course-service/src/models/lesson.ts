import { getDatabase } from '../database';
import { Lesson, CreateLesson, UpdateLesson } from '../types/course';
import { v4 as uuidv4 } from 'uuid';

const TABLE_NAME = 'lessons';

export class LessonModel {
  static async create(moduleId: string, courseId: string, lessonData: CreateLesson): Promise<Lesson> {
    const db = getDatabase();
    
    // Get the next order index if not provided
    let orderIndex = lessonData.orderIndex;
    if (orderIndex === undefined) {
      const result = await db(TABLE_NAME)
        .where({ moduleId })
        .max('orderIndex as maxOrder')
        .first();
      orderIndex = (result?.maxOrder || -1) + 1;
    }
    
    const [lesson] = await db(TABLE_NAME)
      .insert({
        id: uuidv4(),
        moduleId,
        courseId,
        title: lessonData.title,
        description: lessonData.description,
        type: lessonData.type,
        content: lessonData.content,
        contentType: lessonData.contentType || 'markdown',
        videoUrl: lessonData.videoUrl,
        videoDuration: lessonData.videoDuration,
        attachments: lessonData.attachments ? JSON.stringify(lessonData.attachments) : null,
        orderIndex,
        estimatedDuration: lessonData.estimatedDuration,
        isPublished: false,
        isFree: lessonData.isFree || false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning('*');

    return this.formatLesson(lesson);
  }

  static async findById(id: string): Promise<Lesson | null> {
    const db = getDatabase();
    const lesson = await db(TABLE_NAME)
      .where({ id })
      .first();

    return lesson ? this.formatLesson(lesson) : null;
  }

  static async findByModule(moduleId: string): Promise<Lesson[]> {
    const db = getDatabase();
    const lessons = await db(TABLE_NAME)
      .where({ moduleId })
      .orderBy('orderIndex', 'asc');

    return lessons.map(this.formatLesson);
  }

  static async findPublishedByModule(moduleId: string): Promise<Lesson[]> {
    const db = getDatabase();
    const lessons = await db(TABLE_NAME)
      .where({ moduleId, isPublished: true })
      .orderBy('orderIndex', 'asc');

    return lessons.map(this.formatLesson);
  }

  static async findByCourse(courseId: string): Promise<Lesson[]> {
    const db = getDatabase();
    const lessons = await db(TABLE_NAME)
      .where({ courseId })
      .orderBy(['moduleId', 'orderIndex'], ['asc', 'asc']);

    return lessons.map(this.formatLesson);
  }

  static async findPublishedByCourse(courseId: string): Promise<Lesson[]> {
    const db = getDatabase();
    const lessons = await db(TABLE_NAME)
      .where({ courseId, isPublished: true })
      .orderBy(['moduleId', 'orderIndex'], ['asc', 'asc']);

    return lessons.map(this.formatLesson);
  }

  static async findFreeLessons(courseId: string): Promise<Lesson[]> {
    const db = getDatabase();
    const lessons = await db(TABLE_NAME)
      .where({ courseId, isFree: true, isPublished: true })
      .orderBy(['moduleId', 'orderIndex'], ['asc', 'asc']);

    return lessons.map(this.formatLesson);
  }

  static async update(id: string, lessonData: UpdateLesson): Promise<Lesson | null> {
    const db = getDatabase();
    
    const updateData: any = {
      ...lessonData,
      updatedAt: new Date(),
    };

    // Convert attachments array to JSON string
    if (lessonData.attachments) {
      updateData.attachments = JSON.stringify(lessonData.attachments);
    }
    
    const [lesson] = await db(TABLE_NAME)
      .where({ id })
      .update(updateData)
      .returning('*');

    return lesson ? this.formatLesson(lesson) : null;
  }

  static async updateOrderIndex(id: string, orderIndex: number): Promise<boolean> {
    const db = getDatabase();
    
    const result = await db(TABLE_NAME)
      .where({ id })
      .update({
        orderIndex,
        updatedAt: new Date(),
      });

    return result > 0;
  }

  static async reorderLessons(moduleId: string, lessonIds: string[]): Promise<boolean> {
    const db = getDatabase();
    
    try {
      await db.transaction(async (trx) => {
        for (let i = 0; i < lessonIds.length; i++) {
          await trx(TABLE_NAME)
            .where({ id: lessonIds[i], moduleId })
            .update({
              orderIndex: i,
              updatedAt: new Date(),
            });
        }
      });
      
      return true;
    } catch (error) {
      return false;
    }
  }

  static async publish(id: string): Promise<Lesson | null> {
    const db = getDatabase();
    
    const [lesson] = await db(TABLE_NAME)
      .where({ id })
      .update({
        isPublished: true,
        updatedAt: new Date(),
      })
      .returning('*');

    return lesson ? this.formatLesson(lesson) : null;
  }

  static async unpublish(id: string): Promise<Lesson | null> {
    const db = getDatabase();
    
    const [lesson] = await db(TABLE_NAME)
      .where({ id })
      .update({
        isPublished: false,
        updatedAt: new Date(),
      })
      .returning('*');

    return lesson ? this.formatLesson(lesson) : null;
  }

  static async delete(id: string): Promise<boolean> {
    const db = getDatabase();
    
    try {
      await db.transaction(async (trx) => {
        // Delete lesson progress records
        await trx('lesson_progress').where({ lessonId: id }).del();
        
        // Delete the lesson
        await trx(TABLE_NAME).where({ id }).del();
      });
      
      return true;
    } catch (error) {
      return false;
    }
  }

  static async exists(id: string): Promise<boolean> {
    const db = getDatabase();
    const lesson = await db(TABLE_NAME)
      .where({ id })
      .first();

    return !!lesson;
  }

  static async belongsToModule(id: string, moduleId: string): Promise<boolean> {
    const db = getDatabase();
    const lesson = await db(TABLE_NAME)
      .where({ id, moduleId })
      .first();

    return !!lesson;
  }

  static async belongsToCourse(id: string, courseId: string): Promise<boolean> {
    const db = getDatabase();
    const lesson = await db(TABLE_NAME)
      .where({ id, courseId })
      .first();

    return !!lesson;
  }

  static async getLessonCount(moduleId: string): Promise<number> {
    const db = getDatabase();
    const result = await db(TABLE_NAME)
      .where({ moduleId })
      .count('* as count')
      .first();

    return parseInt(result?.count as string || '0');
  }

  static async getPublishedLessonCount(moduleId: string): Promise<number> {
    const db = getDatabase();
    const result = await db(TABLE_NAME)
      .where({ moduleId, isPublished: true })
      .count('* as count')
      .first();

    return parseInt(result?.count as string || '0');
  }

  static async getTotalDuration(moduleId: string): Promise<number> {
    const db = getDatabase();
    const result = await db(TABLE_NAME)
      .where({ moduleId })
      .sum('estimatedDuration as totalDuration')
      .first();

    return parseInt(result?.totalDuration as string || '0');
  }

  static async getPublishedTotalDuration(moduleId: string): Promise<number> {
    const db = getDatabase();
    const result = await db(TABLE_NAME)
      .where({ moduleId, isPublished: true })
      .sum('estimatedDuration as totalDuration')
      .first();

    return parseInt(result?.totalDuration as string || '0');
  }

  private static formatLesson(lesson: any): Lesson {
    return {
      ...lesson,
      attachments: lesson.attachments ? JSON.parse(lesson.attachments) : [],
      createdAt: lesson.createdAt.toISOString(),
      updatedAt: lesson.updatedAt.toISOString(),
    };
  }
}
