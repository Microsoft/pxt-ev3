namespace datalog.ev3 {
    /**
     * A datalog storage for the EV3
     */
    export class EV3DatalogStorage extends DatalogStorage {
        private _filename: string;
        private _buffer: string;
        private _storage: storage.Storage;

        /**
         * Creates a new storage for the datalog
         * @param storage 
         * @param filename 
         */
        constructor(storage: storage.Storage, filename: string) {
            super();
            this._filename = filename;
            this._storage = storage;
        }

        /**
         * Initializes the storage
         */
        init(): void {
            this._storage.remove(this._filename);
            this._buffer = "";
        }
        /**
         * Appends the headers in datalog
         */
        appendHeaders(headers: string[]): void {
            this._storage.appendCSVHeaders(this._filename, headers);
        }
        /**
         * Appends a row of data
         */
        appendRow(values: number[]): void {
            // commit row data
            this._buffer += storage.toCSV(values, this._storage.csvSeparator);
            // buffered writes
            if (this._buffer.length > 512)
                this.flush();
        }
        /**
         * Flushes any buffered data
         */
        flush(): void {
            if (this._buffer) {                                
                const b = this._buffer;
                this._buffer = "";
                this._storage.append(this._filename, b);
            }
        }
    }
    // automatic hook up
    datalog.setStorage(new datalog.ev3.EV3DatalogStorage(storage.temporary, "datalog.csv"));
}
