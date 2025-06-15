import { getDatabase } from '../database';
import { Module, CreateModule, UpdateModule } from '../types/course';
import { v4 as uuidv4 } from 'uuid';

const TABLE_NAME = 'modules';

export class ModuleModel {
  static async create(courseId: string, moduleData: CreateModule): Promise<Module> {
    const db = getDatabase();
    
    // Get the next order index if not provided
    let orderIndex = moduleData.orderIndex;
    if (orderIndex === undefined) {
      const result = await db(TABLE_NAME)
        .where({ courseId })
        .max('orderIndex as maxOrder')
        .first();
      orderIndex = (result?.maxOrder || -1) + 1;
    }
    
    const [module] = await db(TABLE_NAME)
      .insert({
        id: uuidv4(),
        courseId,
        title: moduleData.title,
        description: moduleData.description,
        orderIndex,
        estimatedDuration: 0, // Will be calculated from lessons
        isPublished: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning('*');

    return this.formatModule(module);
  }

  static async findById(id: string): Promise<Module | null> {
    const db = getDatabase();
    const module = await db(TABLE_NAME)
      .where({ id })
      .first();

    return module ? this.formatModule(module) : null;
  }

  static async findByCourse(courseId: string): Promise<Module[]> {
    const db = getDatabase();
    const modules = await db(TABLE_NAME)
      .where({ courseId })
      .orderBy('orderIndex', 'asc');

    return modules.map(this.formatModule);
  }

  static async findPublishedByCourse(courseId: string): Promise<Module[]> {
    const db = getDatabase();
    const modules = await db(TABLE_NAME)
      .where({ courseId, isPublished: true })
      .orderBy('orderIndex', 'asc');

    return modules.map(this.formatModule);
  }

  static async update(id: string, moduleData: UpdateModule): Promise<Module | null> {
    const db = getDatabase();
    
    const [module] = await db(TABLE_NAME)
      .where({ id })
      .update({
        ...moduleData,
        updatedAt: new Date(),
      })
      .returning('*');

    return module ? this.formatModule(module) : null;
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

  static async reorderModules(courseId: string, moduleIds: string[]): Promise<boolean> {
    const db = getDatabase();
    
    try {
      await db.transaction(async (trx) => {
        for (let i = 0; i < moduleIds.length; i++) {
          await trx(TABLE_NAME)
            .where({ id: moduleIds[i], courseId })
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

  static async updateEstimatedDuration(id: string, duration: number): Promise<boolean> {
    const db = getDatabase();
    
    const result = await db(TABLE_NAME)
      .where({ id })
      .update({
        estimatedDuration: duration,
        updatedAt: new Date(),
      });

    return result > 0;
  }

  static async publish(id: string): Promise<Module | null> {
    const db = getDatabase();
    
    const [module] = await db(TABLE_NAME)
      .where({ id })
      .update({
        isPublished: true,
        updatedAt: new Date(),
      })
      .returning('*');

    return module ? this.formatModule(module) : null;
  }

  static async unpublish(id: string): Promise<Module | null> {
    const db = getDatabase();
    
    const [module] = await db(TABLE_NAME)
      .where({ id })
      .update({
        isPublished: false,
        updatedAt: new Date(),
      })
      .returning('*');

    return module ? this.formatModule(module) : null;
  }

  static async delete(id: string): Promise<boolean> {
    const db = getDatabase();
    
    try {
      await db.transaction(async (trx) => {
        // Delete all lessons in this module first
        await trx('lessons').where({ moduleId: id }).del();
        
        // Delete the module
        await trx(TABLE_NAME).where({ id }).del();
      });
      
      return true;
    } catch (error) {
      return false;
    }
  }

  static async exists(id: string): Promise<boolean> {
    const db = getDatabase();
    const module = await db(TABLE_NAME)
      .where({ id })
      .first();

    return !!module;
  }

  static async belongsToCourse(id: string, courseId: string): Promise<boolean> {
    const db = getDatabase();
    const module = await db(TABLE_NAME)
      .where({ id, courseId })
      .first();

    return !!module;
  }

  static async getModuleCount(courseId: string): Promise<number> {
    const db = getDatabase();
    const result = await db(TABLE_NAME)
      .where({ courseId })
      .count('* as count')
      .first();

    return parseInt(result?.count as string || '0');
  }

  static async getPublishedModuleCount(courseId: string): Promise<number> {
    const db = getDatabase();
    const result = await db(TABLE_NAME)
      .where({ courseId, isPublished: true })
      .count('* as count')
      .first();

    return parseInt(result?.count as string || '0');
  }

  private static formatModule(module: any): Module {
    return {
      ...module,
      createdAt: module.createdAt.toISOString(),
      updatedAt: module.updatedAt.toISOString(),
    };
  }
}
