import { Context, Schema, h } from 'koishi'
export const inject = {
    optional: ['cron'],
}

import{} from 'koishi-plugin-cron'

export const name = 'fei-timetoganfan'

export interface Config {
    atTheUser: boolean
    breakfastText: string
    lunchText: string
    dinnerText: string
    snacksText: string
    drinkText: string
    enabledReminderToEat: boolean
    breakfastTime?: string
    lunchTime?: string
    dinnerTime?: string
}

export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
        atTheUser: Schema.boolean().default(false).description('是否@用户'),
        breakfastText: Schema.string().default('你的早饭就吃[food]吧').description('早饭抽取文本'),
        lunchText: Schema.string().default('你的午饭就吃[food]吧').description('午饭抽取文本'),
        dinnerText: Schema.string().default('你的晚饭就吃[food]吧').description('晚饭抽取文本'),
        snacksText: Schema.string().default('你的零食就吃[food]吧').description('零食抽取文本'),
        drinkText: Schema.string().default('你的饮料就喝[food]吧').description('饮料抽取文本'),
    }),
    Schema.object({
        enabledReminderToEat: Schema.boolean().default(false)
        .description('是否启用餐点提醒(依赖cron服务)'),
    }).description('餐点提醒'),
    Schema.union([
        Schema.object({
            enabledReminderToEat: Schema.const(false),
        }),
        Schema.object({
            breakfastTime: Schema.string().default('07:00').description('早餐时间，格式为24小时制 hh:mm，下同'),
            lunchTime: Schema.string().default('12:00').description('午餐时间'),
            dinnerTime: Schema.string().default('18:00').description('晚餐时间'),
        }),
    ])
])

declare module 'koishi' {
    interface Tables {
        userFoodMenu : UserFoodMenu
    }
}

type foodType = "breakfast" | "lunch" | "dinner" | "snacks" | "drink";

export interface UserFoodMenu {
    uid: string
    foodName: string
    foodType: foodType
    weigth: number
}

export const usage = `
现在是...
吃饭时间！
`
export function apply(ctx: Context, config: Config) {
    const foodTypes: foodType[] = ["breakfast", "lunch", "dinner", "snacks", "drink"];

    ctx.model.extend('userFoodMenu', {
        uid: { type :"string", nullable: false },
        foodName: { type :"string", nullable: false },
        foodType: { type :"string", nullable: false },
        weigth: { type :"double", nullable: false },
    },{
        primary: ['uid', 'foodName', 'foodType']
    })

    //当应用启动时设定定时提醒
    ctx.on('ready', () =>{
        if(ctx.cron && config.enabledReminderToEat) {
            const timeFormat = /([01]\d|2[0-3]):([0-5]\d)/;
            if(!timeFormat.test(config.breakfastTime)) {
                throw new Error('早餐时间格式错误！');
            }
            if(!timeFormat.test(config.lunchTime)) {
                throw new Error('午餐时间格式错误！');
            }
            if(!timeFormat.test(config.dinnerTime)) {
                throw new Error('晚餐时间格式错误！');
            }
            const breakfastTimeCron = '0 ' + config.breakfastTime.split(':').map(Number).reverse().join(' ') + ' * * *';
            const lunchTimeCron = '0 ' + config.lunchTime.split(':').map(Number).reverse().join(' ') + ' * * *';
            const dinnerTimeCron = '0 ' + config.dinnerTime.split(':').map(Number).reverse().join(' ') + ' * * *';
            ctx.cron(breakfastTimeCron, async () => {
                ctx.bots.forEach(async bot => {
                    bot.broadcast((await bot.getGuildList()).data.map(
                        guild => guild.id
                    ) ,'早上好！该吃早饭啦！')
                })
            })

            ctx.cron(lunchTimeCron, async () => {
                ctx.bots.forEach(async bot => {
                    bot.broadcast((await bot.getGuildList()).data.map(
                        guild => guild.id
                    ) ,'中午好！该吃午饭啦！')
                })
            })

            ctx.cron(dinnerTimeCron, async () => {
                ctx.bots.forEach(async bot => {
                    bot.broadcast((await bot.getGuildList()).data.map(
                        guild => guild.id
                    ) ,'晚上好！该吃晚饭啦！')
                })
            })
        }
    })
    class FoodMenu {
        data:Array<UserFoodMenu> = [];
        //添加菜单， 返回值是在原本在菜单上但权重增加的{食物:增加权重}的键值对
        add(userFoodMenu: UserFoodMenu | Array<UserFoodMenu>) {
            const foodAddWeightList:{[foodName:string]:number} = {};
            if(Array.isArray(userFoodMenu)) {
                userFoodMenu.forEach(item => {
                    const index = this.data.findIndex(i => i.uid === item.uid && i.foodName === item.foodName && i.foodType === item.foodType);
                    if(~index) {
                        this.data[index].weigth += item.weigth;
                        if(foodAddWeightList[item.foodName] === undefined) 
                            foodAddWeightList[item.foodName] = item.weigth;
                        else
                            foodAddWeightList[item.foodName] += item.weigth;
                    }
                    else {
                        this.data.push(item);

                    }
                })
            }
            else {
                this.data.push(userFoodMenu);
            }
            return foodAddWeightList;
        }

        //将输入的参数数组转换为一个UserFoodMenu数组
        parse(uid: string, foodType: foodType, ...args: string[]) {
            const foodMenuArr:Array<UserFoodMenu> = [];
            if(args.find(userInput => {
                const foodNameWithWigth = userInput.replace('（','(').replace('）',')');  //把中文括号转换为英文
                return !(/(.+)\((\d+)\)$/.test(foodNameWithWigth) ||
                /(.+)\((\d+\.\d+)\)$/.test(foodNameWithWigth) ||
                /(.+)\((\.\d+)\)$/.test(foodNameWithWigth) ||
                /[^()]/.test(foodNameWithWigth));
            })) throw new Error('参数格式错误！应为 食物名1(权重) 食物名2(权重) ...\n权重需要放在括号内，可以不写但不能小于0');
            else {
                args.forEach(userInput => {
                    const foodNameWithWigth = userInput.replace('（','(').replace('）',')');
                    const foodName = foodNameWithWigth.replace(/(.+)\(.+\)$/, '$1');
                    const weigth = Number(foodNameWithWigth.replace(/.+(\(.+\))$/, '$1').replace('(','').replace(')',''));
                    foodMenuArr.push(new UserFoodMenu(uid, foodName, foodType, weigth));
                })
            }
            return foodMenuArr;
        }

        parseAndAdd(uid: string, foodType: foodType, ...args: string[]) {
            return this.add(this.parse(uid, foodType, ...args));
        }
        
        //根据权重从菜单中抽取一个
        draw() {
            const totalWeigth = this.data.reduce((prev, cur) => prev + cur.weigth, 0);
            const random = Math.random() * totalWeigth;
            let currentWeigth = 0;
            for(let i = 0; i < this.data.length; i++) {
                currentWeigth += this.data[i].weigth;
                if(random < currentWeigth) {
                    return this.data[i].foodName;
                }
            }
            return null;
        }

        //该菜单食物权重相同则不显示权重
        async showSingleMenu(uid: string, foodType: foodType) {
            //select的grouBy方法在单参数时会返回一个元素为 {key:value} 的不重复数组
            const weigthGroup = (await ctx.database.select('userFoodMenu').where({ uid, foodType }).groupBy('weigth').execute())
            const sameWeigth = weigthGroup.length === 1;
            const menu = await ctx.database.get('userFoodMenu', { uid, foodType });
            if(menu.length === 0) return '';    
            else if(sameWeigth)
                return '\n当前' + foodTypeText[foodType].name + '菜单： ' + menu.map(item => item.foodName).join('，');
            else
                return '\n当前' + foodTypeText[foodType].name + '菜单： ' + menu.map(item => item.foodName + '(' + item.weigth + ')').join('，');
        }

        async showMenu(uid: string) {
            const foodTypeArr = (await ctx.database.select('userFoodMenu').where({ uid }).groupBy('foodType').execute())
                            .map(item => item.foodType);
            let menuMessage = '';
            await Promise.all(foodTypeArr.map(async foodType => {
                menuMessage += await this.showSingleMenu(uid, foodType);
            }))
            return menuMessage;
        }

        //实际上因为构造时传入的参数是ctx.database的返回值，是一个视为数组使用的FlatPick<UserFoodMenu>
        //因此传入类型应该不会是单个食物的UserFoodMenu...
        constructor(userFoodMenu?: UserFoodMenu | Array<UserFoodMenu>) {
            if(Array.isArray(userFoodMenu)) {
                this.data = userFoodMenu;
            }
            else {
                this.data.push(userFoodMenu);
            }
        }
    }

    class UserFoodMenu {
        uid: string
        foodName: string
        foodType: foodType
        weigth: number = 1;     //权重(必须大于0)

        constructor(uid: string, foodName: string, foodType: foodType, weigth? : number ) {
            this.uid = uid;
            this.foodName = foodName;
            this.foodType = foodType;
            if(weigth) {
                if(weigth < 0) {
                    throw new Error('权重不能小于0...');
                }
                this.weigth = weigth;
            }
        }
    }

    const foodTypeText:{[key in foodType]: {name: string, returnText: string}} = {
        'breakfast' : {name: '早饭', returnText: config.breakfastText},
        'lunch' : {name: '午饭', returnText: config.lunchText},
        'dinner' : {name: '晚饭', returnText: config.dinnerText},
        'snacks' : {name: '零食', returnText: config.snacksText},
        'drink' : {name: '饮料', returnText: config.drinkText},
    }

    ctx.command('吃什么', '这顿该吃啥？').alias('吃啥')
    .action(async ({ session }, message) => {
        if(message === undefined) {
            const hour = new Date().getHours();
            if(4 <= hour && hour < 11)
                session.execute('吃什么 breakfast');
            else if(11 <= hour && hour < 16)
                session.execute('吃什么 lunch');
            else 
                session.execute('吃什么 dinner');
        }
        else if( foodTypes.includes(message as foodType) ) {
            const uid = session.uid;
            const foodType: foodType = message as foodType;
            const foodMenu = new FoodMenu(await ctx.database.get('userFoodMenu', { uid, foodType }));
            if(foodMenu.data.length === 0)
                if(foodType === 'lunch' && (await ctx.database.get('userFoodMenu', { uid, foodType: 'dinner' })).length !== 0)
                    return (config.atTheUser?h.at(session.userId) + ' ': '') + '你的午饭菜单是空的...但是你有晚饭菜单，用指令\n吃什么.复制.晚饭 午饭\n来复制晚饭菜单到午饭菜单';
                else if(foodType === 'dinner' && (await ctx.database.get('userFoodMenu', { uid, foodType: 'lunch' })).length !== 0)
                    return (config.atTheUser?h.at(session.userId) + ' ': '') + '你的晚饭菜单是空的...但是你有午饭菜单，用指令\n吃什么.复制.午饭 晚饭\n来复制午饭菜单到晚饭菜单';
                else return (config.atTheUser?h.at(session.userId) + ' ': '') + `你的${foodTypeText[foodType].name}菜单是空的...用指令\n吃什么.添加.${foodTypeText[foodType].name} 食物名1 食物名2 ...\n来添加菜单`;
            const foodName = foodMenu.draw();
            if(!foodName) return (config.atTheUser?h.at(session.userId) + ' ': '') + '抽取菜单失败！';
            else return (config.atTheUser?h.at(session.userId) + ' ': '') + foodTypeText[foodType].returnText.replace('[food]', foodName);
        }
    })
    //用于注册子指令以及起别名
    ctx.command('吃什么.早饭').alias('.早餐', '早饭吃什么', '早饭吃啥').action(async ({ args, session }) => {
        if( args[0] === '添加' ) 
            session.execute('吃什么.添加 早饭 ' + args.slice(1).join(' '));
        else 
            session.execute('吃什么 breakfast');
    })
    ctx.command('吃什么.午饭').alias('.午餐', '午饭吃什么', '午饭吃啥', '吃什么午饭').action(async ({ args, session }) => {
        if( args[0] === '添加' ) 
            session.execute('吃什么.添加 午饭 ' + args.slice(1).join(' '));
        else 
            session.execute('吃什么 lunch');
    })
    ctx.command('吃什么.晚饭').alias('.晚餐', '晚饭吃什么', '晚饭吃啥', '吃什么晚饭').action(async ({ args, session }) => {
        if( args[0] === '添加' ) 
            session.execute('吃什么.添加 晚饭 ' + args.slice(1).join(' '));
        else 
            session.execute('吃什么 dinner');
    })
    ctx.command('吃什么.零食').alias('.零食', '.小吃', '吃什么零食').action(async ({ args, session }) => {
        if( args[0] === '添加' ) 
            session.execute('吃什么.添加 零食 ' + args.slice(1).join(' '));
        else 
            session.execute('吃什么 snacks');
    })
    ctx.command('吃什么.饮料').alias('.饮料', '喝什么', '喝什么饮料').action(async ({ args, session }) => {
        if( args[0] === '添加' ) 
            session.execute('吃什么.添加 饮料 ' + args.slice(1).join(' '));
        else 
            session.execute('吃什么 drink');
    })

    
    ctx.command('吃什么.添加')
    .action(async ({ args, session }) => {
        if(args.length === 0) {
            return (config.atTheUser?h.at(session.userId) + ' ': '') + '指令格式：\n吃什么 添加 早饭/午饭/晚饭/零食/饮料 食物名1 食物名2 ...\n可以在食物名后面加上(数字)表示权重如\n吃什么 添加 早饭 面包(2) 鸡蛋(1)';
        }
        else if( foodTypes.includes(args[0] as foodType) ) {
            if(args.length === 1) {
                return (config.atTheUser?h.at(session.userId) + ' ': '') + '指令格式：\n吃什么 添加 早饭/午饭/晚饭/零食/饮料 食物名1 食物名2 ...\n可以在食物名后面加上(数字)表示权重如\n吃什么 添加 早饭 面包(2) 鸡蛋(1)';
            }
            const uid = session.uid;
            const foodType: foodType = args[0] as foodType;
            const foodMenu = new FoodMenu(await ctx.database.get('userFoodMenu', { uid, foodType }));
            let addWeigthList = {};
            try {
                addWeigthList = foodMenu.parseAndAdd(uid, foodType, ...args.slice(1));
            }
            catch(err) {
                return (config.atTheUser?h.at(session.userId) + ' ': '') + err.message;
            }
            await ctx.database.upsert('userFoodMenu', foodMenu.data);

            let returnMessage = (config.atTheUser?h.at(session.userId) + ' ': '') + `已添加${foodTypeText[foodType].name}菜单\n`;
            if(Object.keys(addWeigthList).length !== 0) 
                returnMessage += '以下食物权重增加：\n' + Object.keys(addWeigthList).map(foodName => foodName + '(' + addWeigthList[foodName] + ')').join('，');
            returnMessage += await foodMenu.showSingleMenu(uid, foodType);
            return returnMessage;
        }
        
    })
     //用于注册子指令以及起别名
    ctx.command('吃什么.添加早饭').alias('.添加.早饭', '.添加早餐', '添加早饭', '早饭添加').action(async ({ args, session }) => {
        session.execute('吃什么 添加 breakfast ' + args.join(' '));
    })
    ctx.command('吃什么.添加午饭').alias('.添加.午饭', '.添加午餐', '添加午饭', '午饭添加').action(async ({ args, session }) => {
        session.execute('吃什么 添加 lunch ' + args.join(' '));
    })
    ctx.command('吃什么.添加晚饭').alias('.添加.晚饭', '.添加晚餐', '添加晚饭', '晚饭添加').action(async ({ args, session }) => {
        session.execute('吃什么 添加 dinner ' + args.join(' '));
    })
    ctx.command('吃什么.添加零食').alias('.添加.零食', '添加小吃', '零食添加').action(async ({ args, session }) => {
        session.execute('吃什么 添加 snacks ' + args.join(' '));
    })
    ctx.command('吃什么.添加饮料').alias('.添加.饮料', '.添加喝的', '添加饮料', '饮料添加').action(async ({ args, session }) => {
        session.execute('吃什么 添加 drink ' + args.join(' '));
    })

    ctx.command('吃什么.查看').alias('.菜单')
    .action(async ({ session }, message) => {
        const { uid } = session;
        if(message === undefined) {
            if((await ctx.database.get('userFoodMenu', { uid })).length === 0) {
                return (config.atTheUser?h.at(session.userId) + ' ': '') + '你的菜单是空的，用指令\n吃什么.添加.早饭/午饭/晚饭/零食/饮料 食物名1 食物名2 ...\n来添加菜单';
            }
            else {
                return (config.atTheUser?h.at(session.userId) + ' ': '') + '你的菜单如下：' + await (new FoodMenu()).showMenu(uid);
            }
        }
        else if( foodTypes.includes(message as foodType) ) {
            const foodType: foodType = message as foodType;
            const foodMenu = new FoodMenu(await ctx.database.get('userFoodMenu', { uid, foodType }));
            if(foodMenu.data.length === 0)
                return (config.atTheUser?h.at(session.userId) + ' ': '') + `你的${foodTypeText[foodType].name}菜单是空的，用指令\n吃什么.添加.${foodTypeText[foodType].name} 食物名1 食物名2 ...\n来添加菜单`;
            else
                return (config.atTheUser?h.at(session.userId) + ' ': '') + '菜单如下：' + await foodMenu.showSingleMenu(uid, foodType);
        }
        else if(message === '早饭') session.execute('吃什么 查看 breakfast');
        else if(message === '午饭') session.execute('吃什么 查看 lunch');
        else if(message === '晚饭') session.execute('吃什么 查看 dinner');
        else if(message === '零食') session.execute('吃什么 查看 snacks');
        else if(message === '饮料') session.execute('吃什么 查看 drink');
        else return (config.atTheUser?h.at(session.userId) + ' ': '') + '指令格式：\n吃什么 查看 早饭/午饭/晚饭/零食/饮料';
    })

    ctx.command('吃什么.删除').alias('.删除').action(async ({ args, session }) => {
        const { uid } = session;
        let returnMessage = '';
        args.forEach(async (foodName) => {
            if( (await ctx.database.get('userFoodMenu', { uid, foodName })).length === 0) {
                returnMessage += (config.atTheUser?h.at(session.userId) + ' ': '') + '你的菜单中没有' + foodName + '，删除失败！\n';
            }
            else {
                await ctx.database.remove('userFoodMenu', { uid , foodName });
                returnMessage += (config.atTheUser?h.at(session.userId) + ' ': '') + '删除' + foodName + '成功！\n';
            }
        })
        return returnMessage;
    })

    ctx.command('吃什么.复制').alias('拷贝', 'copy')
    .action(async ({ args, session }) => {
        const uid = session.uid;
        const wrongCommandwarning = (config.atTheUser?h.at(session.userId) + ' ': '') + '指令格式：\n吃什么 复制 @别人 \n或\n吃什么 复制 早饭/午饭/晚饭/零食/饮料 @别人\n或\n吃什么 复制 早饭/午饭/晚饭/零食/饮料 菜单名';
        if(args.length === 0) {
            return wrongCommandwarning;
        }
        else if( foodTypes.includes(args[0] as foodType) ) {
            if(args[1] === undefined) {
                return wrongCommandwarning;
            }
            else {
                const foodType: foodType = args[0] as foodType;
                //吃什么.复制 菜单名 @某人 时
                if(h.select(args[1],'at').length === 1) {
                    const targetUid = session.platform + ':' + h.select(args[1],'at')[0].attrs.id;
                    const foodMenu = new FoodMenu(await ctx.database.get('userFoodMenu', { uid: targetUid, foodType }));
                    await ctx.database.remove('userFoodMenu', { uid, foodType });
                    await ctx.database.upsert('userFoodMenu', foodMenu.data);
                    return (config.atTheUser?h.at(session.userId) + ' ': '') + `从 ${args[1]} 复制${foodTypeText[foodType].name}菜单成功！`;
                }
                //吃什么.复制 菜单名 菜单名 时
                else if( foodTypes.includes(args[1] as foodType) ) {
                    const targetFoodType: foodType = args[1] as foodType;
                    const foodMenu = new FoodMenu(await ctx.database.get('userFoodMenu', { uid, foodType: targetFoodType }));
                    await ctx.database.remove('userFoodMenu', { uid, foodType });
                    await ctx.database.upsert('userFoodMenu', foodMenu.data);
                    return (config.atTheUser?h.at(session.userId) + ' ': '') + `从${foodTypeText[targetFoodType].name}复制到${foodTypeText[foodType].name}菜单成功！`;
                }
                else if( args[1] === '早饭') session.execute('吃什么 复制 ' + foodType + ' breakfast');
                else if( args[1] === '午饭') session.execute('吃什么 复制 ' + foodType + ' lunch');
                else if( args[1] === '晚饭') session.execute('吃什么 复制 ' + foodType + ' dinner');
                else if( args[1] === '零食') session.execute('吃什么 复制 ' + foodType + ' snacks');
                else if( args[1] === '饮料') session.execute('吃什么 复制 ' + foodType + ' drink');
                else return wrongCommandwarning;
            }
        }
        //吃什么.复制 @某人 时
        else if(h.select(args[0],'at').length === 1) {
            if(args[1] === undefined) {
                const targetUid = session.platform + ':' + h.select(args[0],'at')[0].attrs.id;
                const foodMenu = new FoodMenu(await ctx.database.get('userFoodMenu', { uid: targetUid }));
                await ctx.database.remove('userFoodMenu', { uid });
                await ctx.database.upsert('userFoodMenu', foodMenu.data);
                return (config.atTheUser?h.at(session.userId) + ' ': '') + `从 ${args[0]} 复制菜单成功！`;
            }
            else if( foodTypes.includes(args[1] as foodType) ) {
                session.execute('吃什么 复制 ' + args[1] + ' ' + args[0]);
            }
        }
        else return wrongCommandwarning;
    })

    ctx.command('吃什么.复制.早饭').alias('.复制早餐', '复制早饭', '早饭复制').action(async ({ args, session }) => {
        session.execute('吃什么 复制 breakfast ' + args.join(' '));
    })
    ctx.command('吃什么.复制.午饭').alias('.复制午餐', '复制午饭', '午饭复制').action(async ({ args, session }) => {
        session.execute('吃什么 复制 lunch ' + args.join(' '));
    })
    ctx.command('吃什么.复制.晚饭').alias('.复制晚餐', '复制晚饭', '晚饭复制').action(async ({ args, session }) => {
        session.execute('吃什么 复制 dinner ' + args.join(' '));
    })
    ctx.command('吃什么.复制.零食').alias('.复制小吃', '复制零食', '零食复制').action(async ({ args, session }) => {
        session.execute('吃什么 复制 snacks ' + args.join(' '));
    })
    ctx.command('吃什么.复制.饮料').alias('.复制喝的', '复制饮料', '饮料复制').action(async ({ args, session }) => {
        session.execute('吃什么 复制 drink ' + args.join(' '));
    })

    ctx.command('吃什么.清空').action(async ({ session }, message) => {
        const { uid } = session;
        if(message === undefined) {
            session.send((config.atTheUser?h.at(session.userId) + ' ': '') + '不输入菜单名会视为清空全部菜单，你确定要清空所有菜单吗？如果确认要这么做，请在十五秒内输入“确认”');
            const confirm = await session.prompt(15000);
            if(confirm === '确认') {
                await ctx.database.remove('userFoodMenu', { uid });
                return (config.atTheUser?h.at(session.userId) + ' ': '') + '清空所有菜单成功！';
            }
            else {
                return((config.atTheUser?h.at(session.userId) + ' ': '') + '没有输入确认，已取消清空');
            }
        }
        else if( foodTypes.includes(message as foodType) ) {
            const foodType: foodType = message as foodType;
            await ctx.database.remove('userFoodMenu', { uid, foodType });
            return (config.atTheUser?h.at(session.userId) + ' ': '') + `清空${foodTypeText[foodType].name}菜单成功！`;
        }
    })
}
