/**
 * @typedef {{sendMessage:(chatId:number,text:string,replyMarkup?:object)=>Promise<unknown>,answerCallbackQuery:(id:string)=>Promise<unknown>}} TelegramDelivery
 * @typedef {{handlesCallback:(data:string)=>boolean,handleCallback:(chatId:number,data:string)=>Promise<unknown>}} CallbackController
 */
export {};
