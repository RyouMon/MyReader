use std::borrow::Cow;

use specta::{
    datatype::{DataType, Primitive},
    Format, Type, Types,
};
use specta_typescript::{Number, Typescript};
use specta_util::Remapper;

use super::{
    AsyncTransportRequest, AsyncTransportResponse, SyncTransportRequest, SyncTransportResponse,
    CORE_CONTRACT_VERSION,
};

const HEADER: &str = r#"// Generated from the Rust transport contract. Do not edit.
// Run `pnpm core:generate-contract` from the repository root to regenerate.

import type { ReaderAnnotationColor } from "@my-reader/tools/reader-annotations"
import type { ReaderLocator } from "@my-reader/tools/reader-toc"
"#;

const HELPERS: &str = r#"
type DomainOf<Request extends { domain: string }> = Request["domain"]

type RequestForDomain<
  Request,
  Domain extends string,
> = Extract<Request, { domain: Domain }> extends { request: infer Value }
  ? Value
  : never

type ResponseForDomain<
  Response,
  Domain extends string,
> = Extract<Response, { domain: Domain }> extends { response: infer Value }
  ? Value
  : never

type OperationOf<Request> = Request extends { operation: infer Operation }
  ? Operation & string
  : never

type InputForOperation<Request, Operation extends string> = Extract<
  Request,
  { operation: Operation }
> extends { input: infer Input }
  ? Input
  : never

type OutputForOperation<Response, Operation extends string> = Extract<
  Response,
  { operation: Operation }
> extends { output: infer Output }
  ? [Output] extends [null]
    ? void
    : Output
  : never

export type CoreSyncDomain = DomainOf<SyncTransportRequest>

export type CoreSyncOperation<
  Domain extends CoreSyncDomain,
> = OperationOf<RequestForDomain<SyncTransportRequest, Domain>>

export type CoreSyncInput<
  Domain extends CoreSyncDomain,
  Operation extends CoreSyncOperation<Domain>,
> = InputForOperation<RequestForDomain<SyncTransportRequest, Domain>, Operation>

export type CoreSyncOutput<
  Domain extends CoreSyncDomain,
  Operation extends CoreSyncOperation<Domain>,
> = OutputForOperation<
  ResponseForDomain<SyncTransportResponse, Domain>,
  Operation
>

export type CoreAsyncDomain = DomainOf<AsyncTransportRequest_Serialize>

export type CoreAsyncOperation<
  Domain extends CoreAsyncDomain,
> = OperationOf<RequestForDomain<AsyncTransportRequest_Serialize, Domain>>

export type CoreAsyncInput<
  Domain extends CoreAsyncDomain,
  Operation extends CoreAsyncOperation<Domain>,
> = InputForOperation<
  RequestForDomain<AsyncTransportRequest_Serialize, Domain>,
  Operation
>

export type CoreAsyncOutput<
  Domain extends CoreAsyncDomain,
  Operation extends CoreAsyncOperation<Domain>,
> = OutputForOperation<
  ResponseForDomain<AsyncTransportResponse_Serialize, Domain>,
  Operation
>
"#;

pub(crate) fn generate_typescript_contract() -> Result<String, String> {
    let types = Types::default()
        .register::<SyncTransportRequest>()
        .register::<SyncTransportResponse>()
        .register::<AsyncTransportRequest>()
        .register::<AsyncTransportResponse>();
    let definitions = Typescript::default()
        .header(HEADER)
        .export(&types, CoreJsonFormat::new())
        .map_err(|error| error.to_string())?;

    Ok(format!(
        "{definitions}\nexport const CORE_CONTRACT_VERSION = {CORE_CONTRACT_VERSION} as const\n{HELPERS}"
    ))
}

struct CoreJsonFormat {
    remapper: Remapper,
}

impl CoreJsonFormat {
    fn new() -> Self {
        let number = Number::<()>::definition(&mut Types::default());
        let remapper = [
            Primitive::usize,
            Primitive::isize,
            Primitive::u64,
            Primitive::i64,
            Primitive::u128,
            Primitive::i128,
            Primitive::f32,
            Primitive::f64,
        ]
        .into_iter()
        .fold(Remapper::new(), |remapper, primitive| {
            remapper.rule(DataType::Primitive(primitive), number.clone())
        });
        Self { remapper }
    }
}

impl Format for CoreJsonFormat {
    fn map_types(&self, types: &Types) -> Result<Cow<'_, Types>, specta::FormatError> {
        let types = specta_serde::PhasesFormat.map_types(types)?;
        Ok(Cow::Owned(self.remapper.remap_types(types.into_owned())))
    }

    fn map_type(
        &self,
        types: &Types,
        data_type: &DataType,
    ) -> Result<Cow<'_, DataType>, specta::FormatError> {
        let data_type = specta_serde::PhasesFormat.map_type(types, data_type)?;
        Ok(Cow::Owned(self.remapper.remap_dt(data_type.into_owned())))
    }
}
