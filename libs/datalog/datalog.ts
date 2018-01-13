//% weight=100 color=#0fbc11 icon=""
namespace datalog {
    let _headers: string[] = undefined;
    let _headersLength: number;
    let _values: number[];
    let _buffer: string = "";
    let _start: number;
    let _filename = "data.csv";
    let _storage: storage.Storage = storage.temporary;

    function clear() {
        _headers = undefined;        
        _values = undefined;
        _buffer = "";
    }

    function init() {
        if (!_headers) {
            _headers = [];
            _headersLength = 0;
            _start = control.millis();
            _storage.remove(_filename);
        }
        _values = [];
    }

    function commit() {
        // write row if any data
        if (_values && _values.length > 0) {
            // write headers for the first row
            if (!_headersLength) {
                _storage.appendCSVHeaders(_filename, _headers);
                _headersLength = _storage.size(_filename);
            }
            // commit row data
            _buffer += storage.toCSV(_values, _storage.csvSeparator);
            // buffered writes
            if (_buffer.length > 1024)
                flush();
        }

        // clear values
        _values = undefined;
    }

    /**
     * Starts a row of data
     */
    //% weight=100
    //% blockId=datalogAddRow block="datalog add row"
    export function addRow(): void {
        commit();
        init();
        const s = (control.millis() - _start) / 1000;
        addValue("time (s)", s);
    }

    /**
     * Adds a cell to the row of data
     * @param name name of the cell, eg: "x"
     * @param value value of the cell, eg: 0
     */
    //% weight=99
    //% blockId=datalogAddValue block="datalog add %name|=%value"
    export function addValue(name: string, value: number) {
        if (!_values) return;
        let i = _headers.indexOf(name);
        if (i < 0) {
            _headers.push(name);
            i = _headers.length - 1;
        }
        _values[i] = value;
        if (i > 0) // 0 is time
            console.logValue(name, value)
    }

    /**
     * Starts a new data logger for the given file
     */
    //%
    export function setFile(fn: string) {
        flush();
        _filename = fn;
        clear();
    }

    /**
     * 
     * @param storage custom storage solution
     */
    //%
    export function setStorage(storage: storage.Storage) {
        flush();
        _storage = storage;
        clear();
    }

    /**
     * Commits any buffered row to disk
     */
    //%
    export function flush() {
        if (_buffer) {
            const b = _buffer;
            _buffer = "";
            _storage.append(_filename, b);
        }
    }
}
