export interface Result{
    success: boolean;
    message: string;
}
export interface ResultOf<T> extends Result {
    item?: T;
}