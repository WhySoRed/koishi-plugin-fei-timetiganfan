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
  
export interface UserFoodMenu {
    uid: string
    foodName: string
    type: "breakfast" | "lunch" | "dinner" | "snacks" | "drink"
    weigth: number
}

export const usage = `
现在是...
吃饭时间！
`
export function apply(ctx: Context, config: Config) {

    ctx.model.extend('userFoodMenu', {
        uid: { type :"string", nullable: false },
        foodName: { type :"string", nullable: false },
        type: { type :"string", nullable: false },
        weigth: { type :"double", nullable: false },
    },{
        primary: ['uid', 'foodName', 'type']
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
                    const index = this.data.findIndex(i => i.uid === item.uid && i.foodName === item.foodName && i.type === item.type);
                    if(~index) {
                        this.data[index].weigth += item.weigth;
                        foodAddWeightList[item.foodName] = item.weigth;
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
        parse(uid: string, type: "breakfast" | "lunch" | "dinner" | "snacks" | "drink", ...args: string[]) {
            const foodMenuArr:Array<UserFoodMenu> = [];
            if(args.find(async userInput => {
                const foodNameWithWigth = userInput.replace('（','(').replace('）',')');  //把中文括号转换为英文
                return !/(.+)\((\d+)\)$/.test(foodNameWithWigth) &&
                !/(.+)\((\d+\.\d+)\)$/.test(foodNameWithWigth) &&
                !/(.+)\((\.\d+)\)$/.test(foodNameWithWigth) &&
                !/[^()]/.test(foodNameWithWigth);
            })) throw new Error('参数格式错误！应为 食物名1(权重) 食物名2(权重) ...\n权重需要放在括号内，可以不写但不能小于0');
            else {
                args.forEach(userInput => {
                    const foodNameWithWigth = userInput.replace('（','(').replace('）',')');
                    const foodName = foodNameWithWigth.replace(/(.+)\(.+\)$/, '$1');
                    const weigth = Number(foodNameWithWigth.replace(/.+(\(.+\))$/, '$1').replace('(','').replace(')',''));
                    foodMenuArr.push(new UserFoodMenu(uid, foodName, type, weigth));
                })
            }
            return foodMenuArr;
        }

        parseAndAdd(uid: string, type: "breakfast" | "lunch" | "dinner" | "snacks" | "drink", ...args: string[]) {
            return this.add(this.parse(uid, type, ...args));
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

        //实际上因为构造时传入的参数是ctx.database的返回值，是一个视为数组使用的FlatPick<UserFoodMenu>
        //因此传入类型应该不会是单个食物的UserFoodMenu...
        constructor(userFoodMenu: UserFoodMenu | Array<UserFoodMenu>) {
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
        type: "breakfast" | "lunch" | "dinner" | "snacks" | "drink"
        weigth: number = 1;     //权重(必须大于0)

        constructor(uid: string, foodName: string, type: "breakfast" | "lunch" | "dinner" | "snacks" | "drink", weigth? : number ) {
            this.uid = uid;
            this.foodName = foodName;
            this.type = type;
            if(weigth) {
                if(weigth < 0) {
                    throw new Error('权重不能小于0...');
                }
                this.weigth = weigth;
            }
        }
    }

    ctx.command('吃什么', '这顿该吃啥？').alias('吃啥')
    .action(async ({ session }, message) => {
        if(message === undefined) {
            const hour = new Date().getHours();
            if(4 <= hour && hour < 11)
                session.execute('吃什么.早饭');
            else if(11 <= hour && hour < 16)
                session.execute('吃什么.午饭');
            else 
                session.execute('吃什么.晚饭');
        }
    })

    ctx.command('吃什么.早饭').alias('.早餐', '早饭吃什么', '早饭吃啥')
    .action(async ({ session }) => {
        const foodMenu = new FoodMenu(await ctx.database.get('userFoodMenu', { uid: session.uid, type: 'breakfast' }));
        if(foodMenu.data.length === 0) 
            return (config.atTheUser?h.at(session.userId) + ' ': '') + '你的早饭菜单是空的，用指令\n吃什么.添加.早饭 食物名1 食物名2 ...\n来添加菜单';
        const foodName = foodMenu.draw();
        if(!foodName) return (config.atTheUser?h.at(session.userId) + ' ': '') + '抽取菜单失败！';
        else return (config.atTheUser?h.at(session.userId) + ' ': '') + config.breakfastText.replace('[food]', foodName);
    })

    ctx.command('吃什么.午饭').alias('.午餐', '午饭吃什么', '午饭吃啥', '吃什么午饭')
    .action(async ({ session }) => {
        const foodMenu = new FoodMenu(await ctx.database.get('userFoodMenu', { uid: session.uid, type: 'lunch' }));
        if(foodMenu.data.length === 0) {
            if((await ctx.database.get('userFoodMenu', { uid: session.uid, type: 'dinner' })).length !== 0)
                return (config.atTheUser?h.at(session.userId) + ' ': '') + '你的午饭菜单是空的，但是你有晚饭菜单，用指令\n吃什么.复制.晚饭 午饭\n来复制晚饭菜单到午饭菜单';
            else 
                return (config.atTheUser?h.at(session.userId) + ' ': '') + '你的午饭菜单是空的，用指令\n吃什么.添加.午饭 食物名1 食物名2 ...\n来添加菜单';
        }
        const foodName = foodMenu.draw();
        if(!foodName) return (config.atTheUser?h.at(session.userId) + ' ': '') + '抽取菜单失败！';
        else return (config.atTheUser?h.at(session.userId) + ' ': '') + config.lunchText.replace('[food]', foodName);
    })

    ctx.command('吃什么.晚饭').alias('.晚餐', '晚饭吃什么', '晚饭吃啥', '吃什么晚饭')
    .action(async ({ session }) => {
        const foodMenu = new FoodMenu(await ctx.database.get('userFoodMenu', { uid: session.uid, type: 'dinner' }));
        if(foodMenu.data.length === 0) {
            if((await ctx.database.get('userFoodMenu', { uid: session.uid, type: 'lunch' })).length !== 0)
                return (config.atTheUser?h.at(session.userId) + ' ': '') + '你的晚饭菜单是空的，但是你有午饭菜单，用指令\n吃什么.复制.午饭 晚饭\n来复制午饭菜单到晚饭菜单';
            else 
                return (config.atTheUser?h.at(session.userId) + ' ': '') + '你的晚饭菜单是空的，用指令\n吃什么.添加.晚饭 食物名1 食物名2 ...\n来添加菜单';
        }
        const foodName = foodMenu.draw();
        if(!foodName) return (config.atTheUser?h.at(session.userId) + ' ': '') + '抽取菜单失败！';
        else return (config.atTheUser?h.at(session.userId) + ' ': '') + config.dinnerText.replace('[food]', foodName);
    })

    ctx.command('吃什么.零食').alias('.零食', '.小吃', '吃什么零食')
    .action(async ({ session }) => {
        const foodMenu = new FoodMenu(await ctx.database.get('userFoodMenu', { uid: session.uid, type: 'snacks' }));
        if(foodMenu.data.length === 0) 
            return (config.atTheUser?h.at(session.userId) + ' ': '') + '你的零食单是空的，用指令\n吃什么.添加.零食 食物名1 食物名2 ...\n来添加菜单';
        const foodName = foodMenu.draw();
        if(!foodName) return (config.atTheUser?h.at(session.userId) + ' ': '') + '抽取菜单失败！';
    })

    ctx.command('吃什么.饮料').alias('.饮料', '喝什么', '喝什么饮料')
    .action(async ({ session }) => {
        const foodMenu = new FoodMenu(await ctx.database.get('userFoodMenu', { uid: session.uid, type: 'drink' }));
        if(foodMenu.data.length === 0) 
            return (config.atTheUser?h.at(session.userId) + ' ': '') + '你的饮料单是空的，用指令\n吃什么.添加.饮料 食物名1 食物名2 ...\n来添加菜单';
        const foodName = foodMenu.draw();
        if(!foodName) return (config.atTheUser?h.at(session.userId) + ' ': '') + '抽取菜单失败！';
    })

    ctx.command('吃什么.查看').alias('.菜单')
    .action(async ({ session }) => {
        const { uid } = session;
        if((await ctx.database.get('userFoodMenu', { uid })).length === 0) {
            return (config.atTheUser?h.at(session.userId) + ' ': '') + '你的菜单是空的，用指令\n吃什么.添加.早饭/午饭/晚饭/零食/饮料 食物名1 食物名2 ...\n来添加菜单';
        }
        else {
             //该菜单食物权重相同则不显示权重
            async function addWeigth(sameWeigth:boolean, arr:Array<UserFoodMenu>) {
                if(sameWeigth) return arr.map(item => item.foodName).join('，');
                else return arr.map(item => item.foodName + '(' + item.weigth + ')').join('，');
            }
            async function showMenu(type: "breakfast" | "lunch" | "dinner" | "snacks" | "drink") {
                //select的grouBy方法在单参数时会返回一个元素为 {key:value} 的不重复数组
                const weigthGroup = (await ctx.database.select('userFoodMenu').where({ uid, type }).groupBy('weigth').execute())
                const sameWeigth = weigthGroup.length > 1
                const menu = await ctx.database.get('userFoodMenu', { uid, type });
                if(menu.length === 0) return '';
                else return '\n' + type + '：' + addWeigth(sameWeigth, menu);
            }
            return (config.atTheUser?h.at(session.userId) + ' ': '') + '你的菜单如下：' +
                    await showMenu('breakfast') + 
                    await showMenu('lunch') + 
                    await showMenu('dinner') + 
                    await showMenu('snacks') + 
                    await showMenu('drink');
        }
    })

    ctx.command('吃什么.添加')
    .action(async ({ args, session }) => {
        return (args);
    })

    ctx.command('吃什么.添加早饭').alias('.添加早餐', '添加早饭', '早饭添加')
    ctx.command('吃什么.添加午饭').alias('.添加午餐', '添加午饭', '午饭添加')
    ctx.command('吃什么.添加晚饭').alias('.添加晚餐', '添加晚饭', '晚饭添加')
    ctx.command('吃什么.添加零食').alias('添加小吃', '零食添加')
    ctx.command('吃什么.添加饮料').alias('.添加喝的', '添加饮料', '饮料添加')

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

    ctx.command('吃什么.复制')
}
