use std::collections::BTreeSet;

use automerge::{legacy::ObjectId, AutoCommit, ChangeHash, Prop, ReadDoc};

use crate::sync::SyncError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) enum ProjectionDomain {
    Catalog,
    Positions,
    Favorites,
    Bookmarks,
    Annotations,
    Sessions,
    Completions,
}

impl ProjectionDomain {
    fn from_root(root: &str) -> Option<Self> {
        match root {
            "catalog" => Some(Self::Catalog),
            "positions" => Some(Self::Positions),
            "favorites" => Some(Self::Favorites),
            "bookmarks" => Some(Self::Bookmarks),
            "annotations" => Some(Self::Annotations),
            "sessions" => Some(Self::Sessions),
            "completions" => Some(Self::Completions),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum ProjectionMode {
    Full,
    Changed,
    None,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ProjectionScope {
    Full,
    Domains(BTreeSet<ProjectionDomain>),
}

impl ProjectionScope {
    pub(crate) fn includes(&self, domain: ProjectionDomain) -> bool {
        match self {
            Self::Full => true,
            Self::Domains(domains) => domains.contains(&domain),
        }
    }

    pub(crate) fn for_document(
        document: &mut AutoCommit,
        base_heads: &[ChangeHash],
        mode: ProjectionMode,
    ) -> Result<Self, SyncError> {
        match mode {
            ProjectionMode::Full => return Ok(Self::Full),
            ProjectionMode::None => return Ok(Self::Domains(BTreeSet::new())),
            ProjectionMode::Changed => {}
        }
        let mut domains = BTreeSet::new();
        // Inspect operations, not only visible patches: projections also read
        // losing conflicts (position candidates and delete-wins tombstones).
        for change in document.get_changes(base_heads) {
            for operation in change.decode().operations {
                if operation.obj == ObjectId::Root {
                    // Identity, schema or root replacement requires a rebuild.
                    return Ok(Self::Full);
                }
                let object = document
                    .import_obj(&operation.obj.to_string())
                    .map_err(projection_error)?;
                // path() includes invisible ancestors; visible_path() does not.
                let path = document.parents(&object).map_err(projection_error)?.path();
                let domain = match path.first() {
                    Some((_, Prop::Map(root))) => ProjectionDomain::from_root(root),
                    _ => None,
                };
                let Some(domain) = domain else {
                    return Ok(Self::Full);
                };
                domains.insert(domain);
            }
        }
        Ok(Self::Domains(domains))
    }
}

fn projection_error(error: automerge::AutomergeError) -> SyncError {
    SyncError::Sync(format!(
        "Failed to locate changed Automerge domain: {error}"
    ))
}
