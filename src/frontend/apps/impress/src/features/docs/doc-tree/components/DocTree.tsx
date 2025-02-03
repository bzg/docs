import { useEffect } from 'react';
import { css } from 'styled-components';

import { fetchAPI } from '@/api';
import { Box, SeparatedSection, StyledLink } from '@/components';
import { TreeView } from '@/components/common/tree/TreeView';
import { useTreeStore } from '@/components/common/tree/treeStore';
import { useCunninghamTheme } from '@/cunningham';

import { Doc, useDoc } from '../../doc-management';
import { SimpleDocItem } from '../../docs-grid';
import { useInfiniteDocChildren } from '../api/useDocChildren';
import { TreeViewDataType, TreeViewMoveResult } from '../types/tree';

import { DocTreeItem } from './DocTreeItem';

type Props = {
  docId: Doc['id'];
};

export type DocTreeDataType = TreeViewDataType<Doc>;
export const DocTree = ({ docId }: Props) => {
  const { spacingsTokens } = useCunninghamTheme();
  const spacing = spacingsTokens();
  const { data: rootNode } = useDoc({ id: docId });
  const {
    selectedNode,
    setSelectedNode,
    setTreeData: setTreeDataStore,
    treeData: treeDataStore,
  } = useTreeStore();

  console.log('treeDataStore', treeDataStore);

  const { data, isLoading, isFetching, isRefetching } = useInfiniteDocChildren({
    docId,
    page_size: 25,
    page: 1,
  });

  const afterMove = async (
    result: TreeViewMoveResult,
    newTreeData: TreeViewDataType<Doc>[],
  ) => {
    setTreeDataStore(newTreeData);
    const { targetNodeId, mode: position, sourceNodeId } = result;
    await fetchAPI(`documents/${sourceNodeId}/move/`, {
      method: 'POST',
      body: JSON.stringify({
        target_document_id: targetNodeId,
        position,
      }),
    });
  };

  useEffect(() => {
    if (!data) {
      return;
    }

    const newChildren = data.pages.flatMap((page) => page.results);
    const newData: DocTreeDataType[] = newChildren.map((child) => ({
      ...child,
      childrenCount: child.numchild,
      children: [],
      parentId: docId,
    }));
    setTreeDataStore(newData);
  }, [data, setTreeDataStore, docId]);

  console.log('selectedNode', selectedNode, rootNode);
  const isRootNodeSelected = !selectedNode
    ? true
    : selectedNode?.id === rootNode?.id;

  if (isLoading || isFetching || isRefetching) {
    return <div>Loading...</div>;
  }

  if (!data) {
    return <div>No data</div>;
  }

  return (
    <>
      <SeparatedSection showSeparator={false}>
        <Box $padding={{ horizontal: 'sm' }}>
          <Box
            $css={css`
              padding: ${spacing['2xs']};
              border-radius: 4px;
              background-color: ${isRootNodeSelected
                ? 'var(--c--theme--colors--greyscale-100)'
                : 'transparent'};
            `}
          >
            {rootNode && (
              <StyledLink
                href={`/docs/${rootNode.id}`}
                onClick={() => {
                  setSelectedNode(rootNode);
                }}
              >
                <SimpleDocItem doc={rootNode} showAccesses={false} />
              </StyledLink>
            )}
          </Box>
        </Box>
      </SeparatedSection>
      <Box $padding={{ all: 'sm' }} $margin={{ top: '-35px' }} $width="100%">
        <TreeView
          treeData={treeDataStore}
          width="100%"
          selectedNodeId={selectedNode?.id}
          rootNodeId={docId}
          renderNode={(props) => <DocTreeItem {...props} />}
          afterMove={(result, newTreeData) => {
            void afterMove(result, newTreeData);
          }}
        />
      </Box>
    </>
  );
};
