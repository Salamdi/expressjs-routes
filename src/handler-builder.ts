/**
 * @module root
 */
import {
    argValidator as _argValidator,
    schemaHelper as _schemaHelper,
} from '@vamship/arg-utils';
import _loggerProvider from '@vamship/logger';
import { Promise } from 'bluebird';
import _dotProp from 'dot-prop';
import { Handler, NextFunction, Request, Response } from 'express';
import {
    IInput,
    InputMapper,
    OutputMapper,
    RequestHandler,
} from './handler-types';

/**
 * Class that can be used to build HTTP request handlers for express js.
 * Breaks down requests into three distinct phases:
 *
 * (1) Request mapping: Generate a JSON object from the incoming HTTP request
 *
 * (2) Request processing: Process the JSON object and return a response
 *
 * (3) Response mapping: Generate an HTTP response based on the JSON response
 */
export default class HandlerBuilder {
    private static DEFAULT_INPUT_MAPPER(): IInput {
        return {};
    }
    private static DEFAULT_OUTPUT_MAPPER(data: unknown, res: Response): void {
        res.json(data);
    }

    private _inputMapper: InputMapper;
    private _handler: RequestHandler;
    private _outputMapper: OutputMapper;
    private _handlerName: string;
    private _schema?: {};

    /**
     * @param handler The request handler function
     * @param handlerName An identifying string for the handler
     */
    constructor(handlerName: string, handler: RequestHandler) {
        _argValidator.checkString(
            handlerName,
            1,
            'handlerName cannot be empty (arg #1)'
        );
        this._handler = handler;
        this._handlerName = handlerName;
        this._schema = undefined;
        this._inputMapper = HandlerBuilder.DEFAULT_INPUT_MAPPER;
        this._outputMapper = HandlerBuilder.DEFAULT_OUTPUT_MAPPER;
    }

    /**
     * Builds a request handler function that can be assigned to expressjs
     * routes.
     *
     * @return An expressjs request handler.
     */
    public build(): Handler {
        const schemaChecker = this._schema
            ? _schemaHelper.createSchemaChecker(this._schema)
            : (): boolean => true;

        return (
            req: Request,
            res: Response,
            next: NextFunction
        ): Promise<void> => {
            const requestId = Math.random().toString(36).substring(2, 15);

            const logger = _loggerProvider.getLogger(
                `handler:${this._handlerName}`,
                {
                    requestId,
                }
            );
            Promise.try(() => {
                logger.info('HANDLER START');
                logger.info('Mapping request to input');
                const input = this._inputMapper(req);

                logger.trace({ input }, 'Handler input');

                if (this._schema) {
                    logger.info('Validating input schema');
                    schemaChecker(input, true);
                } else {
                    logger.info(
                        'No schema specified. Skipping schema validation'
                    );
                }

                logger.info('Executing handler');
                return this._handler(
                    input,
                    {
                        requestId,
                    },
                    {
                        logger,
                        alias: process.env.NODE_ENV || 'default',
                    }
                );
            })
                .then((output) => {
                    logger.trace({ output }, 'Handler output');
                    logger.info('HANDLER END');
                    return this._outputMapper(output, res, next);
                })
                .catch((ex) => {
                    logger.error(ex, 'Error executing handler');
                    logger.info('HANDLER END');
                    next(ex);
                });
        };
    }

    /**
     * Sets the input mapping for the handler.
     *
     * @param mapping A mapping function that maps the HTTP request to an input
     *        object, or, a map that maps input properties to the corresponding
     *        values from the HTTP request. Supported mapping values include:
     *        1. params: Maps values from req.params to the input
     *        2. body: Maps values from req.body to the input
     *
     * @returns A reference to the handler builder, to be used for function
     *          chaining.
     */
    public setInputMapper(
        mapping: { [prop: string]: string } | InputMapper
    ): HandlerBuilder {
        if (typeof mapping === 'function') {
            this._inputMapper = mapping;
        } else {
            this._inputMapper = (req: Request): {} => {
                return Object.keys(mapping).reduce((result, prop) => {
                    const path = mapping[prop];
                    const value = _dotProp.get(req, path);
                    _dotProp.set(result, prop, value);
                    return result;
                }, {});
            };
        }
        return this;
    }

    /**
     * Sets the schema to be used when validating mapped input objects.
     *
     * @param schema A JSON schema object that can be used to validate the
     *        mapped input.
     *
     * @returns A reference to the handler builder, to be used for function
     *          chaining.
     */
    public setSchema(schema: {}): HandlerBuilder {
        this._schema = schema;
        return this;
    }

    /**
     * Sets the output mapping for the handler.
     *
     * @param mapping A mapping function that maps the output of the handler
     *        function to an HTTP response object.
     *
     * @returns A reference to the handler builder, to be used for function
     *          chaining.
     */
    public setOutputMapper(mapping: OutputMapper): HandlerBuilder {
        this._outputMapper = mapping;
        return this;
    }
}
