declare namespace SqlMan {
  /** 总配置 */
  interface SQLManConfig {
    // sql文件路径
    sqlDir?: string;
  }
  /** 配置选项 */
  interface DbOption {
    /** 跳过undefined字段,默认为false */
    skipUndefined?: boolean;
    /** 跳过null字段,默认为false */
    skipNull?: boolean;
    /** 跳过空字符串,默认为false */
    skipEmptyString?: boolean;
    /** 返回本次操作的表名,常用于分表操作;参数是DbConfig中配置的tableName;默认使用DbConfig中配置的tableName */
    tableName?: (serviceTableName: string) => string;
  }
  /** 预处理sql */
  interface PrepareSql {
    /** sql语句,参数是 ? */
    sql: string;
    /**
     * 配合sql使用的参数
     * 通过server的内置方式生成sql时,sql中参数类型是 ?, 参数值 是按顺序push的数组
     * 通过自定义sql生成时,参数类型是 :key, 参数值 是json对象
     *
     * @type {(any[] | {[key: string]: any})}
     * @memberof PrepareSql
     */
    params: any[] | {[key: string]: any};
  }
  /** sql语句缓存集 */
  class SqlCache {
    /** 从这个集合中，加载并编译返回预查询对象 */
    loadSqlById(sqlid: string, params: {[key: string]: any}, isPage?: boolean | undefined): PrepareSql;
  }
  /** 分页查询工具类 */
  class PageQuery {
    /** 添加参数 */
    param(key: string, value: any): this;
    /** 批量添加参数 */
    params(param: {[key: string]: any}): this;
    /** 设置排序语句 */
    orderBy(orderby: string): this;
    /** 设置第几页 */
    pageNumber(page: number): this;
    /** 设置每页记录数 */
    pageSize(size: number): this;
    /**
     * 设置 分页语句是否由 sql语句自行管理?
     * 自行管理时，参数会多出 limitStart\limitEnd\orderBy 3个
     * @param {(string | boolean)} limitSelf
     * @returns {this}
     * @memberof PageQuery
     */
    limitSelf(limitSelf: string | boolean): this;
    /** 返回查询列表使用的sql对象 */
    list(): PrepareSql;
    /** 返回查询条数使用的sql对象  */
    count(): PrepareSql;
  }
  /** Lambda */
  class LambdaQuery<T> {
    constructor (table: string);
    and(lambda: LambdaQuery<T>): this;
    or(lambda: LambdaQuery<T>): this;
    andEq(key: keyof T, value: T[keyof T]): this;
    andNotEq(key: keyof T, value: T[keyof T]): this;
    andGreat(key: keyof T, value: T[keyof T]): this;
    andGreatEq(key: keyof T, value: T[keyof T]): this;
    andLess(key: keyof T, value: T[keyof T]): this;
    andLessEq(key: keyof T, value: T[keyof T]): this;
    andLike(key: keyof T, value: T[keyof T]): this;
    andNotLike(key: keyof T, value: T[keyof T]): this;
    andLeftLike(key: keyof T, value: T[keyof T]): this;
    andNotLeftLike(key: keyof T, value: T[keyof T]): this;
    andRightLike(key: keyof T, value: T[keyof T]): this;
    andNotRightLike(key: keyof T, value: T[keyof T]): this;
    andIsNull(key: keyof T): this;
    andIsNotNull(key: keyof T): this;
    andIn(key: keyof T, value: Array<string | boolean | number>): this;
    andNotIn(key: keyof T, value: Array<string | boolean | number>): this;
    andBetween(key: keyof T, value1: T[keyof T], value2: T[keyof T]): this;
    andNotBetween(key: keyof T, value1: T[keyof T], value2: T[keyof T]): this;
    groupBy(key: keyof T): this;
    updateColumn(key: keyof T, value: T[keyof T]): this;
    asc(...keys: Array<keyof T>): this;
    desc(...keys: Array<keyof T>): this;
    limit(startRow: number, pageSize: number): this;
    where(): string;
    select(...columns: Array<keyof T>): PrepareSql;
    one(...columns: Array<keyof T>): PrepareSql;
    count(): PrepareSql;
    update(data?: T): PrepareSql;
    delete(): PrepareSql;
  }
  /** 预处理sql类 */
  class SqlServer<T> {
    /**
     * 插入
     * @param {{[P in keyof T]?: T[P]}} data
     * @param {DbOption} [option]
     * @memberof SqlServer
     */
    insert(data: {[P in keyof T]?: T[P];}, option?: DbOption): PrepareSql;
    /**
     * 如果指定columns不存在数据库中，则插入数据
     * @param {{[P in keyof T]?: T[P]}} data
     * @param {(keyof T)[]} columns
     * @param {DbOption} [option]
     * @memberof SqlServer
     */
    insertIfNotExists(data: {[P in keyof T]?: T[P];}, columns: (keyof T)[], option?: DbOption): PrepareSql;
    /**
     * 插入或替换(按唯一约束判断且先删除再插入,因此性能较低于insertIfNotExists)
     * @param {{[P in keyof T]?: T[P]}} data
     * @param {DbOption} [option]
     * @memberof SqlServer
     */
    replace(data: {[P in keyof T]?: T[P];}, option?: DbOption): PrepareSql;
    /**
     * 批量插入
     * @param {{[P in keyof T]?: T[P]}[]} datas
     * @param {DbOption} [option]
     * @memberof SqlServer
     */
    insertBatch(datas: {[P in keyof T]?: T[P];}[], option?: DbOption): PrepareSql[];
    /**
     * 批量进行：如果指定列名不存在数据库中，则插入数据
     * @param {{[P in keyof T]?: T[P]}} data
     * @param {(keyof T)[]} columns
     * @param {DbOption} [option]
     * @memberof SqlServer
     */
    insertBatchIfNotExists(datas: {[P in keyof T]?: T[P];}[], columns: (keyof T)[], option?: DbOption): PrepareSql[];
    /**
     * 批量进行：插入或替换(按唯一约束判断且先删除再插入,因此性能较低于insertIfNotExists)
     * @param {{[P in keyof T]?: T[P]}[]} datas
     * @param {DbOption} [option]
     * @memberof SqlServer
     */
    replaceBatch(datas: {[P in keyof T]?: T[P];}[], option?: DbOption): PrepareSql[];
    /**
     * 根据主键修改
     * @param {{[P in keyof T]?: T[P]}} data
     * @param {DbOption} [option]
     * @memberof SqlServer
     */
    updateById(data: {[P in keyof T]?: T[P];}, option?: DbOption): PrepareSql;
    /**
     * 根据主键 批量修改
     * @param {{[P in keyof T]?: T[P]}[]} datas
     * @param {DbOption} [option]
     * @memberof SqlServer
     */
    updateBatchById(datas: {[P in keyof T]?: T[P];}[], option?: DbOption): PrepareSql[];
    /**
     * 根据条件修改
     * @param {{[P in keyof T]?: T[P]}} data
     * @param {{[P in keyof T]?: T[P]}} where
     * @param {DbOption} [option]
     * @memberof SqlServer
     */
    updateBatch(data: {[P in keyof T]?: T[P];}, where: {[P in keyof T]?: T[P];}, option?: DbOption): PrepareSql;
    /**
     * 根据条件删除
     * @param {{[P in keyof T]?: T[P]}} where
     * @param {DbOption} [option]
     * @memberof SqlServer
     */
    deleteBatch(where: {[P in keyof T]?: T[P];}, option?: DbOption): PrepareSql;
    /**
     * 根据单个主键删除
     * 如果设置了逻辑删除,那么这里是一个update而不是delete
     * @param {*} id
     * @param {DbOption} [option]
     * @memberof SqlServer
     */
    deleteById(id: any, option?: DbOption): PrepareSql;
    /**
     * 根据多个主键删除
     * @param {{[P in keyof T]?: T[P]}} data
     * @param {DbOption} [option]
     * @memberof SqlServer
     */
    deleteByIdMuti(data: {[P in keyof T]?: T[P];}, option?: DbOption): PrepareSql;
    /**
     * 根据主键查询
     * @param {*} id
     * @param {DbOption} [option]
     * @memberof SqlServer
     */
    selectById(id: any, option?: DbOption): PrepareSql;
    /**
     * 根据主键查询：多重主键
     * @param {{[P in keyof T]?: T[P]}} data
     * @param {DbOption} [option]
     * @memberof SqlServer
     */
    selectByIdMuti(data: {[P in keyof T]?: T[P];}, option?: DbOption): PrepareSql;
    /**
     * 查询全部
     * @param {DbOption} [option]
     * @memberof SqlServer
     */
    all(option?: DbOption): PrepareSql;
    /**
     * 分页方式查询全部数据
     * @param {number} start
     * @param {number} size
     * @param {DbOption} [option]
     * @memberof SqlServer
     */
    allPage(start: number, size: number, option?: DbOption): PrepareSql;
    /**
     * 返回总条数
     * @param {DbOption} [option]
     * @memberof SqlServer
     */
    allCount(option?: DbOption): PrepareSql;
    /**
     * 根据模版查询所有数据,仅支持 = 操作符
     * @param {{[P in keyof T]?: T[P]}} where
     * @param {DbOption} [option]
     * @memberof SqlServer
     */
    template(where: {[P in keyof T]?: T[P];}, option?: DbOption): PrepareSql;
    /**
     * 根据模版查询一条数据,仅支持 = 操作符
     * @param {{[P in keyof T]?: T[P]}} where
     * @param {DbOption} [option]
     * @memberof SqlServer
     */
    templateOne(where: {[P in keyof T]?: T[P];}, option?: DbOption): PrepareSql;
    /**
     * 根据模版查询所有数据,仅支持 = 操作符,且分页
     * @param {{[P in keyof T]?: T[P]}} where
     * @param {number} start
     * @param {number} size
     * @param {DbOption} [option]
     * @memberof SqlServer
     */
    templatePage(where: {[P in keyof T]?: T[P];}, start: number, size: number, option?: DbOption): PrepareSql;
    /**
     * 根据模版查询条数,仅支持 = 操作符
     * @param {{[P in keyof T]?: T[P]}} where
     * @param {DbOption} [option]
     * @memberof SqlServer
     */
    templateCount(where: {[P in keyof T]?: T[P];}, option?: DbOption): PrepareSql;
    /**
     * 简单自定义查询
     * @param  x
     * @param {DbOption} [option]
     * @memberof SqlServer
    */
    customQuery(x: {where?: {[P in keyof T]?: T[P];}; columns?: (keyof T)[]; startRow?: number; pageSize?: number; orders?: [keyof T, "asc" | "desc"][]}, option?: DbOption): PrepareSql;
    /**
     * 创建分页查询工具
     * @param {string} sqlid
     * @returns {PageQuery<T>}
     * @memberof SqlServer
     */
    pageQuery(sqlid: string): PageQuery;
    /**
     * 创建lambda查询工具
     * @template L
     * @param {DbOption} [option]
     * @returns {LambdaQuery<L>}
     * @memberof SqlServer
     */
    lambdaQuery<L>(option?: DbOption): LambdaQuery<L>;
    /**
     * 创建lambda查询工具
     * @param {DbOption} [option]
     * @returns {LambdaQuery<T>}
     * @memberof SqlServer
     */
    lambdaQueryMe(option?: DbOption): LambdaQuery<T>;
  }
  /** 数据库配置文件,适用于实体类 */
  function DbConfig(config: {
    /** 对应的表名 */
    tableName: string;
    /** 表中的主键 */
    ids?: string[];
    /** 逻辑删除配置 */
    logicDelete?: {
      /** 逻辑删除状态名 */
      stateFileName: string;
      /** 逻辑删除时状态值 */
      deleteState: string;
    };
  });
  /**
   * 获取sql生成类,如果不存在就创建一个新的并返回
   * 要求对应的实体类添加注解 @DbConfig
   * 例：
   *
   * const userHelper = sqlMan<User>(User);
   *
   * const user = new User();
   *
   * const pre = userHelper.insert(user);
   *
   * console.log(pre.sql);
   *
   * console.log(pre.params);
   * @template T
   * @param {*} classtype
   * @returns {SqlServer<T>}
   */
  function getSqlServer<T>(classtype: any): SqlServer<T>;
  /**
   * 建立一个新的sql语句缓存集
   * 该缓存集会加载到内存中,之后可通过name获取到此缓存集
   * @param {string} name
   * @param {string} sqlDir
   */
  function createSqlCache(name: string, sqlDir: string): void;
  /**
   * 获取sql语句缓存集,name不传时,会返回通过 .sqlman.js 配置的缓存集
   * @param {(string | undefined)} [name]
   * @returns {SqlCache}
   */
  function getSqlCache(name?: string | undefined): SqlCache;
}
export = SqlMan;
