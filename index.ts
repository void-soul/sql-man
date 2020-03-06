import * as  fs from 'fs';
import {join, basename, extname} from 'path';

const _tableName = Symbol('tableName');
const _ids = Symbol('ids');
const _logicDelete = Symbol('logicDelete');

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
  params: any[] | {[key: string]: any};
}

const config = {
  maxDeal: 500
} as SQLManConfig;

const sqlCache: {[key: string]: (param: {[k: string]: any}, isPage?: boolean) => string} = {};
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
      const name = basename(modeName, extname(modeName));
      const obj = require(join(config.sqlDir, name)) as {[key: string]: (param: {[k: string]: any}, isPage?: boolean) => string};
      for (const [key, fn] of Object.entries(obj)) {
        sqlCache[`${ name }.${ key }`] = fn;
      }
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

class PageQuery {
  private _limitSelf = false;
  private _pageNumber = 1;
  private _pageSize = 0;
  private _orderBy: string;
  private _param: {[key: string]: any} = {};
  private sqlSource: (...args: any[]) => string;

  constructor (id: string) {
    this.sqlSource = sqlCache[id];
    throwIf(!this.sqlSource, `指定的语句${ id }不存在!`);
  }

  param(key: string, value: any): this {
    this._param[key] = value;
    return this;
  }

  params(param: {[key: string]: any}): this {
    Object.assign(this._param, param);
    return this;
  }

  orderBy(orderby: string): this {
    if (orderby && !orderby.includes('undefined')) {
      this._orderBy = orderby;
    }
    return this;
  }
  pageNumber(page: number): this {
    this._pageNumber = page;
    return this;
  }
  pageSize(size: number): this {
    this._pageSize = size;
    return this;
  }
  limitSelf(limitSelf: boolean | string): this {
    this._limitSelf = limitSelf === true || limitSelf === 'true';
    return this;
  }

  list(): PrepareSql {
    if (this._limitSelf === false) {
      const sqls = [
        `SELECT _a.* FROM (`,
        this.sqlSource(this._param, false),
        ') _a'
      ];
      if (this._orderBy) {
        sqls.push('ORDER BY');
        sqls.push(this._orderBy);
      }
      if (this._pageSize > 0) {
        sqls.push('LIMIT');
        sqls.push(`${ (this._pageNumber - 1) * this._pageSize }`);
        sqls.push(`${ this._pageSize }`);
      }
      return {
        sql: sqls.join(' '),
        params: this._param
      };
    } else {
      const params = {
        ...this._param,
        limitStart: (this._pageNumber - 1) * this._pageSize,
        limitEnd: this._pageSize,
        orderBy: this._orderBy
      };
      return {
        sql: this.sqlSource(params, false),
        params
      };
    }
  }

  count(): PrepareSql {
    return {
      sql: this.sqlSource(this._param, true),
      params: this._param
    };
  }
}

class LambdaQuery<T> {
  private andQuerys: LambdaQuery<T>[] = [];
  private orQuerys: LambdaQuery<T>[] = [];
  private condition: string[] = [];
  private group: (keyof T)[] = [];
  private order: string[] = [];
  private param: {[key: string]: any} = {};
  private index = 0;
  private startRow = 0;
  private pageSize = 0;
  private table: string;
  private updateData?: T;
  constructor (table: string) {
    this.table = table;
  }
  and(lambda: LambdaQuery<T>): this {
    this.andQuerys.push(lambda);
    return this;
  }
  or(lambda: LambdaQuery<T>): this {
    this.orQuerys.push(lambda);
    return this;
  }
  andEq(
    key: keyof T,
    value: T[keyof T]
  ): this {
    return this.common(key, value, '=');
  }
  andNotEq(
    key: keyof T,
    value: T[keyof T]
  ): this {
    return this.common(key, value, '<>');
  }
  andGreat(
    key: keyof T,
    value: T[keyof T]
  ): this {
    return this.common(key, value, '>');
  }
  andGreatEq(
    key: keyof T,
    value: T[keyof T]
  ): this {
    return this.common(key, value, '>=');
  }
  andLess(
    key: keyof T,
    value: T[keyof T]
  ): this {
    return this.common(key, value, '<');
  }
  andLessEq(
    key: keyof T,
    value: T[keyof T]
  ): this {
    return this.common(key, value, '<=');
  }
  andLike(
    key: keyof T,
    value: T[keyof T]
  ): this {
    return this.like(key, value);
  }
  andNotLike(
    key: keyof T,
    value: T[keyof T]
  ): this {
    return this.like(key, value, 'NOT');
  }
  andLeftLike(
    key: keyof T,
    value: T[keyof T]
  ): this {
    return this.like(key, value, '', '%', '');
  }
  andNotLeftLike(
    key: keyof T,
    value: T[keyof T]
  ): this {
    return this.like(key, value, 'NOT', '%', '');
  }
  andRightLike(
    key: keyof T,
    value: T[keyof T]
  ): this {
    return this.like(key, value, '', '', '%');
  }
  andNotRightLike(
    key: keyof T,
    value: T[keyof T]
  ): this {
    return this.like(key, value, 'NOT', '', '%');
  }
  andIsNull(key: keyof T): this {
    return this.nil(key);
  }
  andIsNotNull(key: keyof T): this {
    return this.nil(key, 'NOT');
  }
  andIn(key: keyof T, value: T[keyof T][]): this {
    return this.commonIn(key, value);
  }
  andNotIn(key: keyof T, value: T[keyof T][]): this {
    return this.commonIn(key, value, 'NOT');
  }
  andBetween(
    key: keyof T,
    value1: T[keyof T],
    value2: T[keyof T]
  ): this {
    return this.between(key, value1, value2);
  }
  andNotBetween(
    key: keyof T,
    value1: T[keyof T],
    value2: T[keyof T]
  ): this {
    return this.between(key, value1, value2, 'NOT');
  }

  groupBy(key: keyof T): this {
    this.group.push(key);
    return this;
  }

  asc(...keys: (keyof T)[]): this {
    for (const key of keys) {
      this.order.push(`${ key } ASC`);
    }
    return this;
  }

  desc(...keys: (keyof T)[]): this {
    for (const key of keys) {
      this.order.push(`${ key } DESC`);
    }
    return this;
  }

  limit(startRow: number, pageSize: number): this {
    this.startRow = startRow;
    this.pageSize = pageSize;
    return this;
  }
  where(): string {
    return this.condition.join(' ');
  }
  updateColumn(key: keyof T, value: T[keyof T]) {
    if (!this.updateData) {
      this.updateData = {} as T;
    }
    this.updateData[key] = value;
    return this;
  }
  select(...columns: (keyof T)[]): PrepareSql {
    let sql = `SELECT ${
      columns && columns.length > 0 ? columns.join(',') : '*'
      } FROM ${ this.table } `;
    sql += `WHERE 1 = 1 ${ this.where() } `;
    if (this.orQuerys.length > 0) {
      for (const query of this.orQuerys) {
        sql += ` OR (${ query.where() }) `;
      }
    }
    if (this.andQuerys.length > 0) {
      for (const query of this.andQuerys) {
        sql += ` AND (${ query.where() }) `;
      }
    }
    if (this.group.length > 0) {
      sql += `GROUP BY ${ this.group.join(',') } `;
    }
    if (this.order.length > 0) {
      sql += `ORDER BY ${ this.order.join(',') } `;
    }
    if (this.pageSize > 0) {
      sql += `LIMIT ${ this.startRow }, ${ this.pageSize }`;
    }
    return {
      sql,
      params: this.param
    };
  }
  count(): PrepareSql {
    let sql = `SELECT COUNT(1) FROM ${ this.table } `;
    sql += `WHERE 1 = 1 ${ this.where() } `;
    if (this.orQuerys.length > 0) {
      for (const query of this.orQuerys) {
        sql += ` OR (${ query.where() }) `;
      }
    }
    if (this.andQuerys.length > 0) {
      for (const query of this.andQuerys) {
        sql += ` AND (${ query.where() }) `;
      }
    }
    if (this.group.length > 0) {
      sql += `GROUP by ${ this.group.join(',') } `;
    }
    return {
      sql,
      params: this.param
    };
  }
  update(data?: T): PrepareSql {
    if (!data) {
      data = {} as T;
    }
    if (this.updateData) {
      Object.assign(data, this.updateData);
    }
    let sql = `UPDATE ${ this.table } SET `;
    const sets = new Array<string>();
    for (const key in data) {
      if ((data as any).hasOwnProperty(key)) {
        sets.push(` ${ key } = :${ key } `);
      }
    }
    sql += `${ sets.join(',') } WHERE 1 = 1 ${ this.where() } `;
    if (this.orQuerys.length > 0) {
      for (const query of this.orQuerys) {
        sql += ` OR (${ query.where() }) `;
      }
    }
    if (this.andQuerys.length > 0) {
      for (const query of this.andQuerys) {
        sql += ` AND (${ query.where() }) `;
      }
    }
    return {
      sql,
      params: {
        ...this.param,
        ...data
      }
    };
  }
  delete(): PrepareSql {
    let sql = `DELETE FROM ${ this.table }  WHERE 1 = 1 ${ this.where() } `;
    if (this.orQuerys.length > 0) {
      for (const query of this.orQuerys) {
        sql += ` OR (${ query.where() }) `;
      }
    }
    if (this.andQuerys.length > 0) {
      for (const query of this.andQuerys) {
        sql += ` AND (${ query.where() }) `;
      }
    }
    return {
      sql,
      params: this.param
    };
  }
  private nil(key: keyof T, not = ''): this {
    this.condition.push(`AND ${ key } is ${ not } null`);
    return this;
  }
  private like(
    key: keyof T,
    value: any,
    not = '',
    left = '%',
    right = '%'
  ): this {
    const pkey = `${ key }_${ this.index++ }`;
    this.condition.push(
      `AND ${ key } ${ not } like concat('${ left }', :${ pkey }, '${ right }') `
    );
    this.param[pkey] = value;
    return this;
  }
  private between(
    key: keyof T,
    value1: any,
    value2: any,
    not = ''
  ): this {
    const pkey1 = `${ key }_${ this.index++ }`;
    const pkey2 = `${ key }_${ this.index++ }`;
    this.condition.push(`AND ${ key } ${ not } BETWEEN :${ pkey1 } AND :${ pkey2 }`);
    this.param[pkey1] = value1;
    this.param[pkey2] = value2;
    return this;
  }
  private common(
    key: keyof T,
    value: any,
    op: string,
    not = ''
  ) {
    const pkey = `${ key }_${ this.index++ }`;
    this.condition.push(`AND ${ key } ${ not } ${ op } :${ pkey } `);
    this.param[pkey] = value;
    return this;
  }
  private commonIn(
    key: keyof T,
    value: any,
    not = ''
  ) {
    const pkey = `${ key }_${ this.index++ }`;
    this.condition.push(`AND ${ key } ${ not } IN (:${ pkey }) `);
    this.param[pkey] = value;
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
    this.tableName = classtype[_tableName];
    throwIf(!this.tableName, '没有定义数据库相关配置,请在实体类上添加DbConfig注解');
    this.idNames = classtype[_ids];
    this.keys = [];
    for (const key in classtype) {
      this.keys.push(key as any);
    }
    if (classtype[_logicDelete]) {
      this.stateFileName = classtype[_logicDelete].stateFileName;
      this.deleteState = classtype[_logicDelete].deleteState;
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
    const length = Math.ceil(datas.length / config.maxDeal!);
    const tableName = option!.tableName!(this.tableName);
    const keys = Object.keys(datas[0]);
    const values = '(' + new Array<string>(keys.length).fill('?').join(',') + ')';
    const start = `INSERT INTO ${ tableName } (`;
    const keyStr = keys.join(',');

    for (let i = 0; i < length; i++) {
      const target = this.filterEmptyAndTransients(datas.slice(i * config.maxDeal!, (i + 1) * config.maxDeal!), option!.skipNullUndefined, option!.skipNullUndefined);

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
    const length = Math.ceil(datas.length / config.maxDeal!);
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
      const target = this.filterEmptyAndTransients(datas.slice(i * config.maxDeal!, (i + 1) * config.maxDeal!), option!.skipNullUndefined, option!.skipNullUndefined);

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
    const length = Math.ceil(datas.length / config.maxDeal!);
    const tableName = option!.tableName!(this.tableName);
    const keys = Object.keys(datas[0]);
    const values = '(' + new Array<string>(keys.length).fill('?').join(',') + ')';
    const start = `REPLACE INTO ${ tableName } (`;
    const keyStr = keys.join(',');

    for (let i = 0; i < length; i++) {
      const target = this.filterEmptyAndTransients(datas.slice(i * config.maxDeal!, (i + 1) * config.maxDeal!), option!.skipNullUndefined, option!.skipNullUndefined);

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
    const length = Math.ceil(datas.length / config.maxDeal!);
    const tableName = option!.tableName!(this.tableName);
    const keys = Object.keys(datas[0]);
    const start = `UPDATE ${ tableName } SET `;
    const caseStr = `WHEN ${ this.idNames.flatMap(item => `${ item } = ?`).join(' AND ') } THEN ?`;

    for (let i = 0; i < length; i++) {
      const target = this.filterEmptyAndTransients(datas.slice(i * config.maxDeal!, (i + 1) * config.maxDeal!), option!.skipNullUndefined, option!.skipNullUndefined);
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

  /**
   * 创建分页查询工具
   * @param {string} sqlid
   * @returns {PageQuery<T>}
   * @memberof SqlMan
   */
  pageQuery(sqlid: string): PageQuery {
    return new PageQuery(sqlid);
  }
  /**
   * 创建lambda查询工具
   * @template L
   * @param {DbOption} [option]
   * @returns {LambdaQuery<L>}
   * @memberof SqlMan
   */
  @defOption()
  lambdaQuery<L>(option?: DbOption): LambdaQuery<L> {
    return new LambdaQuery<L>(option!.tableName!(this.tableName));
  }
  /**
   * 创建lambda查询工具
   * @param {DbOption} [option]
   * @returns {LambdaQuery<T>}
   * @memberof SqlMan
   */
  @defOption()
  lambdaQueryMe(option?: DbOption): LambdaQuery<T> {
    return this.lambdaQuery<T>(option);
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
export const getSqlById = function (sqlid: string, params: {[key: string]: any}, isPage?: boolean): PrepareSql {
  const sqlSource = sqlCache[sqlid];
  throwIf(!sqlSource, `指定的语句${ sqlid }不存在!`);
  return {
    sql: sqlSource(params, isPage),
    params
  };
};

export const DbConfig = (config: {
  tableName: string;
  ids?: string[];
  logicDelete?: {
    stateFileName: string;
    deleteState: string;
  };
}) => <T extends {new(...args: any[]): {}}>(constructor: T) => {
  Object.defineProperty(constructor, _tableName, {
    enumerable: false,
    configurable: false,
    writable: false,
    value: config.tableName
  });
  Object.defineProperty(constructor, _ids, {
    enumerable: false,
    configurable: false,
    writable: false,
    value: config.ids
  });
  Object.defineProperty(constructor, _logicDelete, {
    enumerable: false,
    configurable: false,
    writable: false,
    value: config.logicDelete
  });
  return class extends constructor {
  };
};
