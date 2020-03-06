import * as  fs from 'fs';
import {join} from 'path';


const emptyString = (source: any, dealEmptyString = true): boolean => {
  return (
    source === null ||
    source === undefined ||
    (dealEmptyString === true && (source === '' || `${ source }`.replace(/\s/g, '') === ''))
  );
};
const notEmptyString = (source: any, dealEmptyString = true): boolean => {
  return emptyString(source, dealEmptyString) === false;
};
const throwIf = (test: boolean, message: string) => {
  if (test === true) {
    throw new Error(message);
  }
};
const throwIfNot = (test: boolean, message: string) => {
  if (test !== true) {
    throw new Error(message);
  }
};
interface SQLManConfig {
  sqlDir?: string;
  maxDeal?: number;
}
interface DbOption {
  skipNullUndefined?: boolean;
  skipEmptyString?: boolean;
  tableName?: (serviceTableName: string) => string;
}
interface PrepareSql {
  sql: string;
  params: any[];
}

const SKIP_KEYS = ['__tableName', '__ids', '__logicDelete'];

const config = {
  maxDeal: 500
} as SQLManConfig;
const sqlCache: {[key: string]: (...args: any[]) => string} = {};
const rootDir = join(__dirname, '..', '..');
const configFis = join(rootDir, '.sqlman.js');
if (fs.existsSync(configFis)) {
  Object.assign(
    config,
    require(configFis) as SQLManConfig
  );
  if (config.sqlDir) {
    config.sqlDir = join(rootDir, config.sqlDir);
    const sqlFis = fs.readdirSync(config.sqlDir);
    for (const modeName of sqlFis) {

      const obj = require(join(config.sqlDir, modeName));
    }
  }
}

/** 默认选项注解 */
function defOption() {
  return (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) => {
    const fn = descriptor.value;
    const length = descriptor.value.length;
    descriptor.value = function (...args: any[]) {
      for (let i = args.length; i < length; i++) {
        args[i] = undefined;
      }
      if (args[length - 1]) {
        if (args[length - 1].skipNullUndefined === undefined) {
          args[length - 1].skipNullUndefined = false;
        }
        if (args[length - 1].skipEmptyString === undefined) {
          args[length - 1].skipEmptyString = false;
        }
        if (args[length - 1].skipEmptyString === true) {
          args[length - 1].skipNullUndefined = true;
        }
        if (args[length - 1].tableName === undefined) {
          args[length - 1].tableName = (serviceTable: string) => serviceTable;
        }
      } else {
        args[length - 1] = {
          skipNullUndefined: false,
          skipEmptyString: false,
          tableName: (serviceTable: string) => serviceTable
        };
      }
      return fn.call(this, ...args);
    };
  };
}
const _pageNumber = Symbol('pageNumber');
const _pageSize = Symbol('pageSize');
const _orderBy = Symbol('orderBy');
const _orderMongo = Symbol('_orderMongo');
const _param = Symbol('param');
const _limitSelf = Symbol('limitSelf');

class PageQuery<T>{
  list: T[];
  totalPage: number;
  totalRow: number;
  private [_limitSelf] = false;
  private [_pageNumber] = 1;
  private [_pageSize] = 0;
  private [_orderBy]: string;
  private [_orderMongo]: {[P in keyof T]: 1 | -1};
  private [_param]: {[key: string]: any} = {};
  private search: (
    param: {[key: string]: any},
    pageSize: number,
    pageNumber: number,
    limitSelf: boolean,
    query: PageQuery<T>,
    orderBy?: string,
    orderMongo?: {[P in keyof T]: 1 | -1},
  ) => Promise<void>;
  constructor (
    search: (
      param: {[key: string]: any},
      pageSize: number,
      pageNumber: number,
      limitSelf: boolean,
      query: PageQuery<T>,
      orderBy?: string,
      orderMongo?: {[P in keyof T]: 1 | -1},
    ) => Promise<void>
  ) {
    this.search = search;
  }

  param(key: string, value: any): this {
    this[_param][key] = value;
    return this;
  }
  params(param: {[key: string]: any}): this {
    Object.assign(this[_param], param);
    return this;
  }
  orderBy(orderby: string): this {
    if (orderby && !orderby.includes('undefined')) {
      this[_orderBy] = orderby;
    }
    return this;
  }
  orderByMongo(name: keyof T, type: 1 | -1): this {
    this[_orderMongo][name] = type;
    return this;
  }
  pageNumber(page: number): this {
    this[_pageNumber] = page;
    return this;
  }
  pageSize(size: number): this {
    this[_pageSize] = size;
    return this;
  }
  limitSelf(limitSelf: boolean | string): this {
    this[_limitSelf] = limitSelf === true || limitSelf === 'true';
    return this;
  }

  async select(): Promise<this> {
    await this.search(
      this[_param],
      this[_pageSize],
      this[_pageNumber],
      this[_limitSelf],
      this,
      this[_orderBy],
      this[_orderMongo]
    );
    return this;
  }
}

class SqlMan<T> {
  private tableName: string;
  private idNames: (keyof T)[];
  private keys: (keyof T)[];
  private stateFileName?: string;
  private deleteState?: string;

  constructor (classtype: any) {
    this.tableName = classtype.__tableName;
    throwIf(!this.tableName, '没有定义数据库相关配置,请在实体类上添加DbConfig注解');
    this.idNames = classtype.__ids;
    this.keys = [];
    for (const key in classtype) {
      if (!SKIP_KEYS.includes(key)) {
        this.keys.push(key as any);
      }
    }
    if (classtype.__logicDelete) {
      this.stateFileName = classtype.__logicDelete.stateFileName;
      this.deleteState = classtype.__logicDelete.deleteState;
    }
  }

  /**
   * 插入
   * @param {{[P in keyof T]?: T[P]}} data
   * @param {DbOption} [option]
   * @memberof SqlMan
   */
  @defOption()
  insert(data: {[P in keyof T]?: T[P]}, option?: DbOption): PrepareSql {
    data = this.filterEmptyAndTransient(data, option!.skipNullUndefined, option!.skipNullUndefined);
    const keys = Object.keys(data);

    const sql = [
      `INSERT INTO ${ option!.tableName!(this.tableName) } (`,
      keys.join(','),
      ') VALUES (',
      new Array<string>(keys.length).fill('?').join(',')
    ].join(' ');

    return {
      sql,
      params: Object.values(data).flatMap(item => item === undefined ? null : item)
    };
  }

  /**
   * 如果指定列名不存在数据库中，则插入数据
   * @param {{[P in keyof T]?: T[P]}} data
   * @param {(keyof T)[]} columns
   * @param {DbOption} [option]
   * @memberof SqlMan
   */
  @defOption()
  insertIfNotExists(data: {[P in keyof T]?: T[P]}, columns: (keyof T)[], option?: DbOption): PrepareSql {
    const tableName = option!.tableName!(this.tableName);
    data = this.filterEmptyAndTransient(data, option!.skipNullUndefined, option!.skipNullUndefined);
    const keys = Object.keys(data);

    const sql = [
      `INSERT INTO ${ tableName } (`,
      keys.join(','),
      new Array<string>(keys.length).fill('?').join(','),
      ` WHERE NOT EXISTS( SELECT 1 FROM ${ tableName } WHERE `,
      columns.flatMap(item => `${ item } = ?`).join(' AND '),
      ')'
    ].join(' ');
    return {
      sql,
      params: Object.values(data)
        .flatMap(item => item === undefined ? null : item)
        .concat(
          columns.flatMap(item => data[item] === undefined ? null : data[item])
        )
    };
  }

  /**
   * 插入或替换(按唯一约束判断且先删除再插入,因此性能较低于insertIfNotExists)
   * @param {{[P in keyof T]?: T[P]}} data
   * @param {DbOption} [option]
   * @memberof SqlMan
   */
  @defOption()
  replace(data: {[P in keyof T]?: T[P]}, option?: DbOption): PrepareSql {
    data = this.filterEmptyAndTransient(data, option!.skipNullUndefined, option!.skipNullUndefined);
    const keys = Object.keys(data);

    const sql = [
      `REPLACE INTO ${ option!.tableName!(this.tableName) } (`,
      new Array<string>(keys.length).fill('?').join(','),
      ')'
    ].join(' ');

    return {
      sql,
      params: Object.values(data).flatMap(item => item === undefined ? null : item)
    };
  }

  /**
   *
   * 批量插入
   * @param {{[P in keyof T]?: T[P]}[]} datas
   * @param {DbOption} [option]
   * @memberof SqlMan
   */
  @defOption()
  insertBatch(datas: {[P in keyof T]?: T[P]}[], option?: DbOption): PrepareSql[] {
    if (datas.length === 0) {
      return [];
    }
    const results = new Array<PrepareSql>();
    const length = Math.ceil(datas.length / config.maxDeal);
    const tableName = option!.tableName!(this.tableName);
    const keys = Object.keys(datas[0]);
    const values = '(' + new Array<string>(keys.length).fill('?').join(',') + ')';
    const start = `INSERT INTO ${ tableName } (`;
    const keyStr = keys.join(',');

    for (let i = 0; i < length; i++) {
      const target = this.filterEmptyAndTransients(datas.slice(i * config.maxDeal, (i + 1) * config.maxDeal), option!.skipNullUndefined, option!.skipNullUndefined);

      const sql = [
        start,
        keyStr,
        ') VALUES ',
        new Array<string>(target.length).fill(values).join(',')
      ].join(' ');

      results.push({
        sql,
        params: target.flatMap(item => keys.flatMap(key => item[key] === undefined ? null : item[key])).flat()
      });
    }
    return results;
  }


  /**
   * 批量进行：如果指定列名不存在数据库中，则插入数据
   * @param {{[P in keyof T]?: T[P]}} data
   * @param {(keyof T)[]} columns
   * @param {DbOption} [option]
   * @memberof SqlMan
   */
  @defOption()
  insertBatchIfNotExists(datas: {[P in keyof T]?: T[P]}[], columns: (keyof T)[], option?: DbOption): PrepareSql[] {
    if (datas.length === 0) {
      return [];
    }
    const results = new Array<PrepareSql>();
    const length = Math.ceil(datas.length / config.maxDeal);
    const tableName = option!.tableName!(this.tableName);
    const keys = Object.keys(datas[0]);
    const values = [
      'SELECT',
      new Array<string>(keys.length).fill('?').join(','),
      `WHERE NOT EXISTS( SELECT 1 FROM ${ tableName } WHERE`,
      columns.flatMap(item => `${ item } = ?`).join(' AND '),
      ')'
    ].join(' ');
    const start = `INSERT INTO ${ tableName } ( ${ keys.join(',') } )`;

    for (let i = 0; i < length; i++) {
      const target = this.filterEmptyAndTransients(datas.slice(i * config.maxDeal, (i + 1) * config.maxDeal), option!.skipNullUndefined, option!.skipNullUndefined);

      const sql = [
        start,
        new Array<string>(target.length).fill(values).join(' UNION ALL  ')
      ].join(' ');

      results.push({
        sql,
        params: target.flatMap(item =>
          keys.flatMap(key => item[key] === undefined ? null : item[key]).concat(
            columns.flatMap(key => item[key] === undefined ? null : item[key])
          )
        ).flat()
      });
    }
    return results;
  }

  /**
   *
   * 批量进行：插入或替换(按唯一约束判断且先删除再插入,因此性能较低于insertIfNotExists)
   * @param {{[P in keyof T]?: T[P]}[]} datas
   * @param {DbOption} [option]
   * @memberof SqlMan
   */
  @defOption()
  replaceBatch(datas: {[P in keyof T]?: T[P]}[], option?: DbOption): PrepareSql[] {
    if (datas.length === 0) {
      return [];
    }
    const results = new Array<PrepareSql>();
    const length = Math.ceil(datas.length / config.maxDeal);
    const tableName = option!.tableName!(this.tableName);
    const keys = Object.keys(datas[0]);
    const values = '(' + new Array<string>(keys.length).fill('?').join(',') + ')';
    const start = `REPLACE INTO ${ tableName } (`;
    const keyStr = keys.join(',');

    for (let i = 0; i < length; i++) {
      const target = this.filterEmptyAndTransients(datas.slice(i * config.maxDeal, (i + 1) * config.maxDeal), option!.skipNullUndefined, option!.skipNullUndefined);

      const sql = [
        start,
        keyStr,
        ') VALUES ',
        new Array<string>(target.length).fill(values).join(',')
      ].join(' ');

      results.push({
        sql,
        params: target.flatMap(item =>
          keys.flatMap(key => item[key] === undefined ? null : item[key])
        ).flat()
      });
    }
    return results;
  }

  /**
   * 根据主键修改
   * @param {{[P in keyof T]?: T[P]}} data
   * @param {DbOption} [option]
   * @memberof SqlMan
   */
  @defOption()
  updateById(data: {[P in keyof T]?: T[P]}, option?: DbOption): PrepareSql {
    const where: {[P in keyof T]?: T[P]} = {};
    for (const idName of this.idNames) {
      throwIf(!data[idName], `id must be set!${ this.tableName }`);
      where[idName] = data[idName];
    }
    data = this.filterEmptyAndTransient(data, option!.skipNullUndefined, option!.skipNullUndefined);
    const keys = Object.keys(data);

    const sql = [
      `UPDATE ${ option!.tableName!(this.tableName) } (`,
      'SET',
      keys.flatMap(key => `${ key } = ?`).join(','),
      'WHERE',
      this.idNames.flatMap(key => `${ key } = ?`).join(' AND '),
    ].join(' ');

    return {
      sql,
      params: Object.values(data)
        .flatMap(item => item === undefined ? null : item)
        .concat(Object.values(where))
    };
  }

  /**
   *
   * 根据主键 批量修改
   * @param {{[P in keyof T]?: T[P]}[]} datas
   * @param {DbOption} [option]
   * @memberof SqlMan
   */
  @defOption()
  updateBatchById(datas: {[P in keyof T]?: T[P]}[], option?: DbOption): PrepareSql[] {
    if (datas.length === 0) {
      return [];
    }

    const results = new Array<PrepareSql>();
    const length = Math.ceil(datas.length / config.maxDeal);
    const tableName = option!.tableName!(this.tableName);
    const keys = Object.keys(datas[0]);
    const start = `UPDATE ${ tableName } SET `;
    const caseStr = `WHEN ${ this.idNames.flatMap(item => `${ item } = ?`).join(' AND ') } THEN ?`;

    for (let i = 0; i < length; i++) {
      const target = this.filterEmptyAndTransients(datas.slice(i * config.maxDeal, (i + 1) * config.maxDeal), option!.skipNullUndefined, option!.skipNullUndefined);
      const realLengt = target.length;
      const params = new Array<any>();
      const sql = [
        start,
        keys.flatMap(key => {
          params.splice(params.length - 1, 0, ...target.flatMap(item => this.idNames.flatMap(id => item[id]).concat(item[key]).flat()));
          return [
            key,
            '= CASE',
            new Array<string>(realLengt).fill(caseStr).join(' '),
            'END'
          ].join(',');
        }),
        'WHERE',
        this.idNames.flatMap(key => {
          params.splice(params.length - 1, 0, ...target.flatMap(item => item[key]));
          return `${ key } IN (${ new Array<string>(realLengt).fill('?').join(',') })`;
        }).join(' AND ')
      ].join(' ');

      results.push({sql, params});
    }

    return results;
  }

  /**
   *
   * 根据条件修改
   * @param {{[P in keyof T]?: T[P]}} data
   * @param {{[P in keyof T]?: T[P]}} where
   * @param {DbOption} [option]
   * @memberof SqlMan
   */
  @defOption()
  updateBatch(data: {[P in keyof T]?: T[P]}, where: {[P in keyof T]?: T[P]}, option?: DbOption): PrepareSql {
    const realData = this.filterEmptyAndTransient(data, option!.skipNullUndefined, option!.skipNullUndefined);

    const sql = [
      `UPDATE ${ option!.tableName!(this.tableName) } SET `,
      Object.keys(realData).flatMap(item => `${ item } = ?`),
      'WHERE',
      Object.keys(where).flatMap(item => `${ item } = ?`),
    ].join(' ');

    return {
      sql,
      params: Object.values(realData).concat(Object.values(where))
    };
  }

  /**
   *
   * 根据条件删除
   * @param {{[P in keyof T]?: T[P]}} where
   * @param {DbOption} [option]
   * @memberof SqlMan
   */
  @defOption()
  deleteBatch(where: {[P in keyof T]?: T[P]}, option?: DbOption): PrepareSql {
    const sql = [
      `DELETE FROM ${ option!.tableName!(this.tableName) } `,
      'WHERE',
      Object.keys(where).flatMap(item => `${ item } = ?`),
    ].join(' ');

    return {
      sql,
      params: Object.values(where)
    };
  }

  /**
   * 根据单个主键删除
   * 如果设置了逻辑删除,那么这里是一个update而不是delete
   * @param {*} id
   * @param {DbOption} [option]
   * @memberof SqlMan
   */
  @defOption()
  deleteById(id: any, option?: DbOption): PrepareSql {
    throwIfNot(
      this.idNames.length === 1,
      'this table is muti id(or not set id), please use deleteByIdMuti'
    );
    if (this.deleteState !== undefined && this.stateFileName !== undefined) {
      const sql = [
        `UPDATE ${ option!.tableName!(this.tableName) } `,
        'SET',
        this.stateFileName,
        '= ?',
        'WHERE',
        this.idNames[0],
        '= ?'
      ].join(' ');
      return {
        sql,
        params: [this.deleteState, id]
      };
    } else {
      const sql = [
        `DELETE FROM ${ option!.tableName!(this.tableName) } `,
        'WHERE',
        this.idNames[0],
        '= ?'
      ].join(' ');
      return {
        sql,
        params: [id]
      };
    }
  }

  /**
   * 根据多个主键删除
   * @param {{[P in keyof T]?: T[P]}} data
   * @param {DbOption} [option]
   * @memberof SqlMan
   */
  @defOption()
  deleteByIdMuti(data: {[P in keyof T]?: T[P]}, option?: DbOption): PrepareSql {
    for (const idName of this.idNames) {
      throwIf(!data[idName], `id must be set!${ this.tableName }`);
    }
    if (this.deleteState !== undefined && this.stateFileName !== undefined) {
      const sql = [
        `UPDATE ${ option!.tableName!(this.tableName) } `,
        'SET',
        this.stateFileName,
        '= ?',
        'WHERE',
        this.idNames.flatMap(id => `${ id } = ?`).join(' AND ')
      ].join(' ');
      return {
        sql,
        params: [this.deleteState, ...this.idNames.flatMap(id => data[id])]
      };
    } else {
      const sql = [
        `DELETE FROM ${ option!.tableName!(this.tableName) } `,
        'WHERE',
        this.idNames.flatMap(id => `${ id } = ?`).join(' AND ')
      ].join(' ');
      return {
        sql,
        params: this.idNames.flatMap(id => data[id])
      };
    }
  }

  /**
   * 根据主键查询
   * @param {*} id
   * @param {DbOption} [option]
   * @memberof SqlMan
   */
  @defOption()
  selectById(id: any, option?: DbOption): PrepareSql {
    throwIfNot(
      this.idNames.length === 1,
      'this table is muti id(or not set id), please use selectByIdMuti'
    );
    const sql = [
      'SELECT',
      this.keys.join(','),
      'FROM',
      option!.tableName!(this.tableName),
      'WHERE',
      this.idNames[0],
      '= ?'
    ].join(' ');
    return {
      sql,
      params: [id]
    };
  }
  /**
   * 根据主键查询：多重主键
   * @param {{[P in keyof T]?: T[P]}} data
   * @param {DbOption} [option]
   * @memberof SqlMan
   */
  @defOption()
  selectByIdMuti(data: {[P in keyof T]?: T[P]}, option?: DbOption): PrepareSql {
    for (const idName of this.idNames) {
      throwIf(!data[idName], `id must be set!${ this.tableName }`);
    }
    const sql = [
      'SELECT',
      this.keys.join(','),
      'FROM',
      option!.tableName!(this.tableName),
      'WHERE',
      this.idNames.flatMap(id => `${ id } = ?`).join(' AND ')
    ].join(' ');
    return {
      sql,
      params: this.idNames.flatMap(id => data[id])
    };
  }

  /**
   * 查询全部
   * @param {DbOption} [option]
   * @memberof SqlMan
   */
  @defOption()
  all(option?: DbOption): PrepareSql {
    const sql = [
      'SELECT',
      this.keys.join(','),
      'FROM',
      option!.tableName!(this.tableName)
    ].join(' ');
    return {
      sql,
      params: []
    };
  }

  /**
   * 分页方式查询全部数据
   * @param {number} start
   * @param {number} size
   * @param {DbOption} [option]
   * @memberof SqlMan
   */
  @defOption()
  allPage(start: number, size: number, option?: DbOption): PrepareSql {
    const sql = [
      'SELECT',
      this.keys.join(','),
      'FROM',
      option!.tableName!(this.tableName),
      'LIMIT',
      start,
      size
    ].join(' ');
    return {
      sql,
      params: []
    };
  }

  /**
   * 返回总条数
   * @param {DbOption} [option]
   * @memberof SqlMan
   */
  @defOption()
  allCount(option?: DbOption): PrepareSql {
    const sql = [
      'SELECT COUNT(1) FROM',
      option!.tableName!(this.tableName)
    ].join(' ');
    return {
      sql,
      params: []
    };
  }

  /**
   * 根据模版查询所有数据,仅支持 = 操作符
   * @param {{[P in keyof T]?: T[P]}} where
   * @param {DbOption} [option]
   * @memberof SqlMan
   */
  @defOption()
  template(where: {[P in keyof T]?: T[P]}, option?: DbOption): PrepareSql {
    const sql = [
      'SELECT',
      this.keys.join(','),
      'FROM',
      option!.tableName!(this.tableName),
      'WHERE',
      Object.keys(where).flatMap(id => `${ id } = ?`).join(' AND ')
    ].join(' ');
    return {
      sql,
      params: Object.values(where)
    };
  }

  /**
   * 根据模版查询一条数据,仅支持 = 操作符
   * @param {{[P in keyof T]?: T[P]}} where
   * @param {DbOption} [option]
   * @memberof SqlMan
   */
  @defOption()
  templateOne(where: {[P in keyof T]?: T[P]}, option?: DbOption): PrepareSql {
    const sql = [
      'SELECT',
      this.keys.join(','),
      'FROM',
      option!.tableName!(this.tableName),
      'WHERE',
      Object.keys(where).flatMap(id => `${ id } = ?`).join(' AND '),
      'LIMIT 0, 1'
    ].join(' ');
    return {
      sql,
      params: Object.values(where)
    };
  }

  /**
   * 根据模版查询所有数据,仅支持 = 操作符,且分页
   * @param {{[P in keyof T]?: T[P]}} where
   * @param {number} start
   * @param {number} size
   * @param {DbOption} [option]
   * @memberof SqlMan
   */
  @defOption()
  templatePage(where: {[P in keyof T]?: T[P]}, start: number, size: number, option?: DbOption): PrepareSql {
    const sql = [
      'SELECT',
      this.keys.join(','),
      'FROM',
      option!.tableName!(this.tableName),
      'WHERE',
      Object.keys(where).flatMap(id => `${ id } = ?`).join(' AND '),
      'LIMIT',
      start,
      size
    ].join(' ');
    return {
      sql,
      params: Object.values(where)
    };
  }

  /**
   * 根据模版查询条数,仅支持 = 操作符
   * @param {{[P in keyof T]?: T[P]}} where
   * @param {DbOption} [option]
   * @memberof SqlMan
   */
  @defOption()
  templateCount(where: {[P in keyof T]?: T[P]}, option?: DbOption): PrepareSql {
    const sql = [
      'SELECT COUNT(1) FROM',
      option!.tableName!(this.tableName),
      'WHERE',
      Object.keys(where).flatMap(id => `${ id } = ?`).join(' AND ')
    ].join(' ');
    return {
      sql,
      params: Object.values(where)
    };
  }

  /**
   * 简单自定义查询
   * @param {({
   *     where?: {[P in keyof T]?: T[P]};
   *     columns?: (keyof T)[];
   *     startRow?: number;
   *     pageSize?: number;
   *     orders?: [keyof T, 'asc' | 'desc'][];
   *   })} x
   * @param {DbOption} [option]
   * @memberof SqlMan
   */
  @defOption()
  customQuery(x: {
    where?: {[P in keyof T]?: T[P]};
    columns?: (keyof T)[];
    startRow?: number;
    pageSize?: number;
    orders?: [keyof T, 'asc' | 'desc'][];
  }, option?: DbOption): PrepareSql {
    const params = new Array<any>();
    const sqls = [
      'SELECT',
      (x.columns || this.keys).join(','),
      'FROM',
      option!.tableName!(this.tableName),
    ];
    if (x.where) {
      sqls.push('WHERE');
      sqls.push(Object.keys(x.where).flatMap(id => `${ id } = ?`).join(' AND '));
      params.splice(0, 0, Object.values(x.where));
    }
    if (x.startRow !== undefined && x.pageSize !== undefined) {
      sqls.push(`LIMIT ${ x.startRow }, ${ x.pageSize }`);
    }
    return {
      sql: sqls.join(' '),
      params
    };
  }

  pageQuery(sqlid: string, transaction: any = true): PageQuery<L> {
    const source: SQLSource = this.app.getSql(sqlid);
    return new PageQuery(
      async (
        param: Empty,
        pageSize: number,
        pageNumber: number,
        limitSelf: boolean,
        query: PageQuery<L>,
        orderBy?: string
      ) => {
        let buildParam: Build;
        let sql: string;
        if (limitSelf === false) {
          buildParam = new Build(false, param);
          sql = `SELECT _a.* FROM (${ Mustache.render(
            source.template,
            buildParam,
            this.app.getSqlFn()
          ) }) _a `;
          if (orderBy) {
            sql = `${ sql } ORDER BY ${ orderBy }`;
          }
          if (pageSize > 0) {
            sql = `${ sql } LIMIT ${ calc(pageNumber)
              .sub(1)
              .mul(pageSize)
              .over() }, ${ pageSize }`;
          }
          if (pageSize > 0) {
            const buildParamPage = new Build(true, param);
            const sqlPage = Mustache.render(source.template, buildParamPage, this.app.getSqlFn());
            const totalRow = await this.querySingelRowSingelColumnBySql<number>(
              sqlPage,
              param,
              transaction
            );
            query.totalRow = totalRow || 0;
            query.totalPage = calc(query.totalRow)
              .add(pageSize - 1)
              .div(pageSize)
              .round(0, 2)
              .over();
          }
        } else {
          Object.assign(param, {
            limitStart: calc(pageNumber)
              .sub(1)
              .mul(pageSize)
              .over(),
            limitEnd: calc(pageSize).over(),
            orderBy
          });
          buildParam = new Build(false, param);
          sql = Mustache.render(source.template, buildParam, this.app.getSqlFn());
          if (pageSize > 0) {
            const buildParamPage = new Build(true, param);
            const sqlPage = Mustache.render(source.template, buildParamPage, this.app.getSqlFn());
            const totalRow = await this.querySingelRowSingelColumnBySql<number>(
              sqlPage,
              param,
              transaction
            );
            query.totalRow = totalRow || 0;
            query.totalPage = calc(query.totalRow)
              .add(pageSize - 1)
              .div(pageSize)
              .round(0, 2)
              .over();
          }
        }
        query.list = await this.queryMutiRowMutiColumnBySql<L>(sql, param, transaction);
      }
    );
  }

  /**
   *
   * 过滤掉空属性
   * @private
   * @param {*} source
   * @returns {T}
   */
  private filterEmptyAndTransient(source: any, skipEmpty = true, dealEmptyString = true): {[P in keyof T]?: T[P]} {
    const result: {[P in keyof T]?: T[P]} = {};
    this.keys.forEach((key) => {
      if (skipEmpty === true) {
        if (notEmptyString(source[key], dealEmptyString)) {
          result[key] = source[key];
        }
      } else {
        result[key] = source[key];
      }
    });
    return result;
  }

  /**
   *
   * 过滤掉空属性
   * @private
   * @param {*} source
   * @returns {T}
   */
  private filterEmptyAndTransients(source: any[], skipEmpty = true, dealEmptyString = true): {[P in keyof T]?: T[P]}[] {
    const result = new Array<{[P in keyof T]?: T[P]}>();
    source.forEach((item) => {
      result.push(this.filterEmptyAndTransient(item, skipEmpty, dealEmptyString));
    });
    return result;
  }
}


const cache: {[key: string]: SqlMan<any>} = {};
export const sqlMan = function <T>(classtype: any): SqlMan<T> {
  const key = classtype.toString();
  if (!cache[key]) {
    cache[key] = new SqlMan<T>(classtype);
  }
  return cache[key];
};

export const DbConfig = (config: {
  tableName: string;
  ids?: string[];
  logicDelete?: {
    stateFileName: string;
    deleteState: string;
  };
}) => <T extends {new(...args: any[]): {}}>(constructor: T) => {
  constructor['__tableName'] = config.tableName;
  constructor['__ids'] = config.ids;
  constructor['__logicDelete'] = config.logicDelete;
  return class extends constructor {
  };
};


