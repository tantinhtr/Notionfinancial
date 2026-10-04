/**
 * Mô tả hợp đồng dữ liệu/phương thức của module giao tiếp Telegram.
 * JSDoc hỗ trợ đọc mã; kiểm thử hợp đồng xác nhận hành vi, không phải kiểm tra kiểu lúc chạy.
 */
/**
 * @typedef {{sendMessage:(chatId:number,text:string,replyMarkup?:object)=>Promise<unknown>,answerCallbackQuery:(id:string)=>Promise<unknown>}} TelegramDelivery
 * @typedef {{handlesCallback:(data:string)=>boolean,handleCallback:(chatId:number,data:string)=>Promise<unknown>}} CallbackController
 */
export {};
